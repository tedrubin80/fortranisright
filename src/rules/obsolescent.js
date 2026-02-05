const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * Obsolescent and deprecated feature detection.
 * Based on Fortran 90 §B.1 (Obsolescent features) and
 * Fortran 95 §B.1 (Deleted features).
 *
 * These features were valid in FORTRAN 77 but are flagged as
 * obsolescent or deleted in later standards.
 */

const obsolescentRules = [
  {
    id: 'OBS-001',
    name: 'Arithmetic IF',
    description: 'Arithmetic IF is obsolescent in Fortran 90 and deleted in Fortran 95 (F90 §B.1.5)',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.IF) continue;

        // Arithmetic IF pattern: IF (expr) label, label, label
        // Detect: IF followed by parens, then three comma-separated integer literals
        let depth = 0;
        let afterParen = false;
        let labelCount = 0;

        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === TokenType.NEWLINE || tokens[j].type === TokenType.EOF) break;

          if (tokens[j].type === TokenType.LPAREN) depth++;
          if (tokens[j].type === TokenType.RPAREN) {
            depth--;
            if (depth === 0) {
              afterParen = true;
              continue;
            }
          }

          if (afterParen) {
            if (tokens[j].type === TokenType.INTEGER_LITERAL) labelCount++;
            if (tokens[j].type === TokenType.COMMA) continue;
            if (tokens[j].type === TokenType.WHITESPACE) continue;
            break;
          }
        }

        if (afterParen && labelCount === 3) {
          results.push({
            line: t.line,
            column: t.column,
            message: 'Arithmetic IF statement detected. This is obsolescent in Fortran 90 and deleted in Fortran 95.',
            suggestion: 'Replace with IF/THEN/ELSE IF/ELSE/ENDIF block for clarity and portability.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'OBS-002',
    name: 'PAUSE statement',
    description: 'PAUSE is deleted in Fortran 95 (F90 §B.1.8)',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      for (const t of ctx.tokens) {
        if (t.type === TokenType.PAUSE) {
          results.push({
            line: t.line,
            column: t.column,
            message: 'PAUSE statement is deleted in Fortran 95.',
            suggestion: 'Replace with READ(*,*) for user input pause, or STOP for program termination.',
          });
        }
      }
      return results;
    },
  },

  {
    id: 'OBS-003',
    name: 'ASSIGN and assigned GOTO',
    description: 'ASSIGN statement and assigned GOTO are deleted in Fortran 95 (F90 §B.1.4)',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      for (const t of ctx.tokens) {
        if (t.type === TokenType.ASSIGN) {
          // Distinguish between ASSIGN statement and assignment (=)
          // ASSIGN is a keyword token; regular assignment uses = operator
          results.push({
            line: t.line,
            column: t.column,
            message: 'ASSIGN statement (for assigned GOTO/FORMAT) is deleted in Fortran 95.',
            suggestion: 'Use computed GOTO or SELECT CASE instead of assigned GOTO. Use internal variables for FORMAT switching.',
          });
        }
      }
      return results;
    },
  },

  {
    id: 'OBS-004',
    name: 'Shared DO loop termination',
    description: 'Multiple DO loops sharing the same terminal statement is obsolescent (F90 §B.1.1)',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Track DO loops by their terminal label
      const doLabels = new Map(); // label -> count of DO loops targeting it

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === TokenType.END || t.type === TokenType.EOF) {
          // Check for shared terminations
          for (const [label, count] of doLabels) {
            if (count > 1) {
              results.push({
                line: t.line,
                severity: Severity.WARNING,
                message: `${count} DO loops share terminal label ${label}. Shared DO termination is obsolescent in Fortran 90.`,
                suggestion: 'Give each DO loop its own ENDDO or uniquely-labeled CONTINUE.',
              });
            }
          }
          doLabels.clear();
          continue;
        }

        if (t.type === TokenType.DO) {
          const next = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
          );
          if (next && next.type === TokenType.INTEGER_LITERAL) {
            const label = next.value;
            doLabels.set(label, (doLabels.get(label) || 0) + 1);
          }
        }
      }

      return results;
    },
  },

  {
    id: 'OBS-005',
    name: 'Non-CONTINUE DO termination',
    description: 'DO loop terminating on a statement other than CONTINUE or ENDDO is obsolescent (F90 §B.1.2)',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect DO loop terminal labels
      const doTermLabels = new Set();
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.DO) {
          const next = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
          );
          if (next && next.type === TokenType.INTEGER_LITERAL) {
            doTermLabels.add(next.value);
          }
        }
      }

      // Check what statement each terminal label is on
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.LABEL && doTermLabels.has(tokens[i].value)) {
          const label = tokens[i].value;
          // Find the statement on this label
          const stmtToken = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE &&
                  tk.type !== TokenType.COMMENT && tk.type !== TokenType.LABEL
          );
          if (stmtToken && stmtToken.type !== TokenType.CONTINUE && stmtToken.type !== TokenType.ENDDO) {
            results.push({
              line: tokens[i].line,
              message: `DO loop terminal label ${label} is on a '${stmtToken.value}' statement instead of CONTINUE or ENDDO.`,
              suggestion: 'Use CONTINUE or ENDDO as the terminal statement for DO loops.',
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'OBS-006',
    name: 'Hollerith constants',
    description: 'Hollerith constants (nH...) are deleted in Fortran 95',
    severity: Severity.WARNING,
    standard: 'F90',
    category: 'obsolescent',
    check(ctx) {
      const results = [];
      // Check raw source for Hollerith pattern: digit(s) followed by H
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        const matches = line.matchAll(/\b(\d+)H/gi);
        for (const match of matches) {
          results.push({
            line: i + 1,
            column: match.index + 1,
            message: `Possible Hollerith constant '${match[0]}...' detected. Hollerith is deleted in Fortran 95.`,
            suggestion: "Replace with quoted character strings: 'text' or \"text\".",
          });
        }
      }
      return results;
    },
  },
];

module.exports = obsolescentRules;
