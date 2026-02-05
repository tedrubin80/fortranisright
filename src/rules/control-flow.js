const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * Control flow validation rules.
 * Based on FORTRAN 77 §11 (DO loops, IF, GOTO) and Fortran 90 §8.
 *
 * Key requirements:
 *   - DO loops must have matching terminal statements
 *   - IF/THEN/ELSE/ENDIF must be properly nested
 *   - GOTO targets must reference existing labels
 *   - Arithmetic IF is discouraged (obsolescent in F90)
 */

const controlFlowRules = [
  {
    id: 'CTRL-001',
    name: 'Unmatched DO/ENDDO',
    description: 'DO loops must have a matching ENDDO or labeled CONTINUE (F77 §11.10)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      const doStack = []; // stack of { line, label }

      let lineStart = true;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === TokenType.NEWLINE || t.type === TokenType.EOF) {
          lineStart = true;
          continue;
        }
        if (t.type === TokenType.COMMENT) continue;

        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.END) {
          // Check for unclosed DO loops at end of unit
          for (const unclosed of doStack) {
            results.push({
              line: unclosed.line,
              message: `Unclosed DO loop (started at line ${unclosed.line}). Missing ENDDO or terminal label ${unclosed.label || ''}.`,
              suggestion: 'Add ENDDO or ensure the DO loop label matches a CONTINUE statement.',
            });
          }
          doStack.length = 0;
          lineStart = true;
          continue;
        }

        if (t.type === TokenType.DO && lineStart) {
          // Check if this is a labeled DO: DO label, var = ...
          let label = null;
          const next = tokens[i + 1];
          if (next && next.type === TokenType.INTEGER_LITERAL) {
            label = next.value;
          }
          doStack.push({ line: t.line, label });
          lineStart = false;
          continue;
        }

        if (t.type === TokenType.ENDDO && lineStart) {
          if (doStack.length === 0) {
            results.push({
              line: t.line,
              column: t.column,
              message: 'ENDDO without matching DO statement.',
              suggestion: 'Remove this ENDDO or add the corresponding DO loop.',
            });
          } else {
            doStack.pop();
          }
          lineStart = false;
          continue;
        }

        // Check for labeled CONTINUE that terminates a DO loop
        if (t.type === TokenType.LABEL) {
          // Peek to see if next meaningful token is CONTINUE
          const nextMeaningful = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
          );
          if (nextMeaningful && nextMeaningful.type === TokenType.CONTINUE) {
            const labelVal = t.value;
            // Pop any matching DO loops
            while (doStack.length > 0 && doStack[doStack.length - 1].label === labelVal) {
              doStack.pop();
            }
          }
          continue;
        }

        if (t.type !== TokenType.LABEL) {
          lineStart = false;
        }
      }

      return results;
    },
  },

  {
    id: 'CTRL-002',
    name: 'Unmatched IF/ENDIF',
    description: 'Block IF must have matching ENDIF (F77 §11.6)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      const ifStack = []; // stack of { line }
      let lineTokens = [];

      for (let i = 0; i <= tokens.length; i++) {
        const t = i < tokens.length ? tokens[i] : { type: TokenType.EOF };

        if (t.type === TokenType.NEWLINE || t.type === TokenType.EOF) {
          // Analyze the line's tokens
          const meaningful = lineTokens.filter(
            tk => tk.type !== TokenType.COMMENT && tk.type !== TokenType.LABEL && tk.type !== TokenType.WHITESPACE
          );

          if (meaningful.length > 0) {
            const first = meaningful[0];

            // Reset at program unit boundaries
            if (first.type === TokenType.PROGRAM || first.type === TokenType.SUBROUTINE ||
                first.type === TokenType.FUNCTION || first.type === TokenType.END) {
              for (const unclosed of ifStack) {
                results.push({
                  line: unclosed.line,
                  message: `Unclosed block IF (started at line ${unclosed.line}). Missing ENDIF.`,
                });
              }
              ifStack.length = 0;
            }

            // Block IF: IF (...) THEN
            if (first.type === TokenType.IF) {
              const last = meaningful[meaningful.length - 1];
              if (last.type === TokenType.THEN) {
                ifStack.push({ line: first.line });
              }
              // Otherwise it's a logical IF (single statement) — no ENDIF needed
            }

            if (first.type === TokenType.ELSEIF || first.type === TokenType.ELSE) {
              if (ifStack.length === 0) {
                results.push({
                  line: first.line,
                  column: first.column,
                  message: `${first.value.toUpperCase()} without matching IF/THEN block.`,
                });
              }
            }

            if (first.type === TokenType.ENDIF) {
              if (ifStack.length === 0) {
                results.push({
                  line: first.line,
                  column: first.column,
                  message: 'ENDIF without matching IF/THEN block.',
                });
              } else {
                ifStack.pop();
              }
            }
          }

          lineTokens = [];
          continue;
        }

        lineTokens.push(t);
      }

      return results;
    },
  },

  {
    id: 'CTRL-003',
    name: 'GOTO usage',
    description: 'GOTO statements are discouraged; they reduce code readability and maintainability',
    severity: Severity.STYLE,
    standard: 'F77',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      for (const t of ctx.tokens) {
        if (t.type === TokenType.GOTO) {
          results.push({
            line: t.line,
            column: t.column,
            severity: Severity.STYLE,
            message: 'GOTO statement found. Consider using structured control flow (DO, IF/THEN/ELSE) instead.',
            suggestion: 'Replace GOTO with DO loops or IF/THEN/ELSE blocks for clarity.',
          });
        }
      }
      return results;
    },
  },

  {
    id: 'CTRL-004',
    name: 'GOTO target validation',
    description: 'GOTO must reference an existing statement label within the same program unit',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect labels and GOTO targets per program unit
      let labels = new Set();
      let gotos = []; // { line, target }

      const checkUnit = () => {
        for (const g of gotos) {
          if (!labels.has(g.target)) {
            results.push({
              line: g.line,
              message: `GOTO references label ${g.target} which is not defined in this program unit.`,
              suggestion: `Add label ${g.target} to a statement, or correct the GOTO target.`,
            });
          }
        }
        labels = new Set();
        gotos = [];
      };

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === TokenType.END || t.type === TokenType.EOF) {
          checkUnit();
          continue;
        }

        if (t.type === TokenType.LABEL) {
          labels.add(t.value);
        }

        if (t.type === TokenType.GOTO) {
          // Next token should be the target label
          const next = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
          );
          if (next && next.type === TokenType.INTEGER_LITERAL) {
            gotos.push({ line: t.line, target: next.value });
          }
        }
      }

      checkUnit();
      return results;
    },
  },
];

module.exports = controlFlowRules;
