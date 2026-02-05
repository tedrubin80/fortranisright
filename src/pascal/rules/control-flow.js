const { Severity } = require('../../engine');
const { PascalTokenType } = require('../lexer');

/**
 * Pascal control flow rules.
 * Based on ISO 7185 §6.8 (Statements).
 *
 * Key structures:
 *   - IF/THEN/ELSE — no ENDIF, dangling else problem
 *   - FOR/TO|DOWNTO/DO
 *   - WHILE/DO
 *   - REPEAT/UNTIL
 *   - CASE/OF/END
 *   - GOTO (requires LABEL declaration)
 */

const controlFlowRules = [
  {
    id: 'PAS-CTRL-001',
    name: 'GOTO usage',
    description: 'GOTO statements are discouraged; structured control flow is preferred',
    severity: Severity.STYLE,
    standard: 'ISO7185',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      for (const t of ctx.tokens) {
        if (t.type === PascalTokenType.GOTO) {
          results.push({
            line: t.line,
            column: t.column,
            severity: Severity.STYLE,
            message: 'GOTO statement found. Structured alternatives (IF/WHILE/REPEAT/FOR) are preferred.',
            suggestion: 'Replace GOTO with structured control flow.',
          });
        }
      }
      return results;
    },
  },

  {
    id: 'PAS-CTRL-002',
    name: 'GOTO label declaration',
    description: 'Labels used with GOTO must be declared in a LABEL section (ISO 7185 §6.8.1)',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect declared labels
      const declaredLabels = new Set();
      let inLabel = false;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.LABEL) {
          inLabel = true;
          continue;
        }

        if (inLabel) {
          if (t.type === PascalTokenType.INTEGER_LITERAL || t.type === PascalTokenType.IDENTIFIER) {
            declaredLabels.add(t.value);
          }
          if (t.type === PascalTokenType.SEMICOLON) {
            inLabel = false;
          }
          continue;
        }
      }

      // Check GOTO targets
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.GOTO) continue;

        const target = tokens.slice(i + 1).find(
          t => t.type !== PascalTokenType.COMMENT
        );
        if (target && (target.type === PascalTokenType.INTEGER_LITERAL || target.type === PascalTokenType.IDENTIFIER)) {
          if (!declaredLabels.has(target.value) && declaredLabels.size > 0) {
            results.push({
              line: tokens[i].line,
              column: tokens[i].column,
              message: `GOTO target '${target.value}' is not declared in a LABEL section.`,
              suggestion: `Add 'label ${target.value};' to the declaration section.`,
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-CTRL-003',
    name: 'FOR loop variable modification',
    description: 'The control variable of a FOR loop must not be modified within the loop body (ISO 7185 §6.8.3.9)',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.FOR) continue;

        // Get control variable
        const ctrlVar = tokens.slice(i + 1).find(t => t.type === PascalTokenType.IDENTIFIER);
        if (!ctrlVar) continue;
        const varName = ctrlVar.value.toLowerCase();

        // Find DO to mark start of loop body
        let doIdx = -1;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === PascalTokenType.DO) { doIdx = j; break; }
          if (tokens[j].type === PascalTokenType.SEMICOLON) break;
        }
        if (doIdx === -1) continue;

        // Scan loop body for assignments to the control variable
        // The body is the single statement after DO (or BEGIN...END block)
        let depth = 0;
        let bodyStart = doIdx + 1;
        let inBlock = false;

        for (let j = bodyStart; j < tokens.length; j++) {
          const t = tokens[j];
          if (t.type === PascalTokenType.COMMENT) continue;

          if (t.type === PascalTokenType.BEGIN) { depth++; inBlock = true; }
          if (t.type === PascalTokenType.END) {
            depth--;
            if (depth <= 0) break;
          }

          // Check for assignment to control variable
          if (t.type === PascalTokenType.IDENTIFIER && t.value.toLowerCase() === varName) {
            const next = tokens.slice(j + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
            if (next && next.type === PascalTokenType.ASSIGN) {
              results.push({
                line: t.line,
                column: t.column,
                message: `FOR loop control variable '${ctrlVar.value}' is assigned within the loop body. This is prohibited by the Pascal standard.`,
                suggestion: 'Do not modify the FOR loop control variable inside the loop.',
              });
            }
          }

          // If no BEGIN block, only one statement
          if (!inBlock && t.type === PascalTokenType.SEMICOLON) break;
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-CTRL-004',
    name: 'Dangling ELSE',
    description: 'An ELSE is associated with the nearest preceding IF — use BEGIN/END for clarity',
    severity: Severity.STYLE,
    standard: 'ISO7185',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Detect nested IF without BEGIN/END that has ELSE
      // Pattern: IF ... THEN IF ... THEN ... ELSE
      let ifStack = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.IF) {
          ifStack.push({ line: t.line, hasThen: false });
        }

        if (t.type === PascalTokenType.THEN && ifStack.length > 0) {
          ifStack[ifStack.length - 1].hasThen = true;

          // Check if the statement after THEN is another IF (nested without BEGIN)
          const next = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
          if (next && next.type === PascalTokenType.IF && ifStack.length >= 1) {
            // This could lead to dangling else
            ifStack[ifStack.length - 1].danglingRisk = true;
          }
        }

        if (t.type === PascalTokenType.ELSE) {
          if (ifStack.length > 0 && ifStack[ifStack.length - 1].danglingRisk) {
            results.push({
              line: t.line,
              column: t.column,
              severity: Severity.STYLE,
              message: 'Potential dangling ELSE — this ELSE binds to the nearest IF, which may not be the intended one.',
              suggestion: 'Use BEGIN/END around the inner IF statement to make the binding explicit.',
            });
          }
          if (ifStack.length > 0) ifStack.pop();
        }

        // Reset on statement boundaries
        if (t.type === PascalTokenType.SEMICOLON || t.type === PascalTokenType.END) {
          ifStack = [];
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-CTRL-005',
    name: 'Deep nesting',
    description: 'Deeply nested control structures reduce readability',
    severity: Severity.STYLE,
    standard: 'ISO7185',
    category: 'control-flow',
    check(ctx) {
      const results = [];
      const MAX_DEPTH = 5;
      let depth = 0;

      for (const t of ctx.tokens) {
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.BEGIN) {
          depth++;
          if (depth > MAX_DEPTH) {
            results.push({
              line: t.line,
              severity: Severity.STYLE,
              message: `Nesting depth is ${depth} (exceeds recommended maximum of ${MAX_DEPTH}).`,
              suggestion: 'Extract deeply nested logic into separate procedures.',
            });
          }
        }

        if (t.type === PascalTokenType.END) {
          depth = Math.max(0, depth - 1);
        }
      }

      return results;
    },
  },
];

module.exports = controlFlowRules;
