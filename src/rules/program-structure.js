const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * Program structure rules.
 * Based on FORTRAN 77 §3 and Fortran 90 §11 program structure requirements.
 *
 * A valid program unit must:
 *   - Begin with PROGRAM, SUBROUTINE, FUNCTION, or BLOCK DATA
 *   - End with END
 *   - Have specification statements before executable statements
 *   - Not nest program units (except Fortran 90 CONTAINS)
 */

const programStructureRules = [
  {
    id: 'STRUCT-001',
    name: 'Missing END statement',
    description: 'Every program unit must terminate with an END statement',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;
      let inUnit = false;
      let unitStartLine = 0;
      let unitName = '';
      let hasEnd = false;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === TokenType.NEWLINE || t.type === TokenType.COMMENT || t.type === TokenType.EOF) continue;

        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.BLOCK_DATA) {
          if (inUnit && !hasEnd) {
            results.push({
              line: unitStartLine,
              message: `Program unit '${unitName}' starting at line ${unitStartLine} has no END statement before next unit.`,
              suggestion: 'Add an END statement before the next program unit.',
            });
          }
          inUnit = true;
          unitStartLine = t.line;
          hasEnd = false;
          // Get name
          const next = tokens[i + 1];
          unitName = (next && next.type === TokenType.IDENTIFIER) ? next.value : '(unnamed)';
        }

        if (t.type === TokenType.END) {
          hasEnd = true;
          inUnit = false;
        }
      }

      if (inUnit && !hasEnd) {
        results.push({
          line: unitStartLine,
          message: `Program unit '${unitName}' starting at line ${unitStartLine} has no END statement.`,
          suggestion: 'Add an END statement at the end of the program unit.',
        });
      }

      return results;
    },
  },

  {
    id: 'STRUCT-002',
    name: 'Statement ordering violation',
    description: 'Specification statements must precede executable statements (F77 §3.5)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      const specTypes = new Set([
        TokenType.INTEGER, TokenType.REAL, TokenType.DOUBLE_PRECISION,
        TokenType.COMPLEX, TokenType.LOGICAL, TokenType.CHARACTER,
        TokenType.DIMENSION, TokenType.COMMON, TokenType.EQUIVALENCE,
        TokenType.DATA, TokenType.PARAMETER, TokenType.IMPLICIT,
        TokenType.SAVE, TokenType.EXTERNAL, TokenType.INTRINSIC,
        TokenType.INTENT, TokenType.OPTIONAL,
      ]);

      const execTypes = new Set([
        TokenType.IF, TokenType.DO, TokenType.GOTO, TokenType.CALL,
        TokenType.READ, TokenType.WRITE, TokenType.PRINT,
        TokenType.OPEN, TokenType.CLOSE, TokenType.REWIND,
        TokenType.BACKSPACE, TokenType.ENDFILE, TokenType.INQUIRE,
        TokenType.STOP, TokenType.RETURN, TokenType.ASSIGN,
      ]);

      let seenExecutable = false;
      let execStartLine = 0;

      // Scan first token of each logical line
      let lineStart = true;
      for (const t of tokens) {
        if (t.type === TokenType.NEWLINE || t.type === TokenType.EOF) {
          lineStart = true;
          continue;
        }
        if (t.type === TokenType.COMMENT || t.type === TokenType.LABEL) continue;

        if (!lineStart) continue;
        lineStart = false;

        // Skip PROGRAM/SUBROUTINE/FUNCTION/END/CONTAINS — they're structural
        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.END ||
            t.type === TokenType.CONTAINS || t.type === TokenType.BLOCK_DATA ||
            t.type === TokenType.MODULE || t.type === TokenType.USE) {
          seenExecutable = false;
          continue;
        }

        if (execTypes.has(t.type)) {
          if (!seenExecutable) {
            seenExecutable = true;
            execStartLine = t.line;
          }
        }

        // FORMAT and ENTRY can appear anywhere
        if (t.type === TokenType.FORMAT || t.type === TokenType.ENTRY) continue;

        if (specTypes.has(t.type) && seenExecutable) {
          results.push({
            line: t.line,
            column: t.column,
            message: `Specification statement '${t.value}' appears after executable statement (first executable at line ${execStartLine}).`,
            suggestion: 'Move all type declarations and specification statements before the first executable statement.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'STRUCT-003',
    name: 'IMPLICIT NONE recommended',
    description: 'Program units without IMPLICIT NONE rely on implicit typing (I-N rule)',
    severity: Severity.INFO,
    standard: 'F77',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      let inUnit = false;
      let unitStartLine = 0;
      let unitName = '';
      let hasImplicitNone = false;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === TokenType.NEWLINE || t.type === TokenType.COMMENT) continue;

        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.MODULE) {
          // Check previous unit
          if (inUnit && !hasImplicitNone) {
            results.push({
              line: unitStartLine,
              severity: Severity.INFO,
              message: `Program unit '${unitName}' does not use IMPLICIT NONE. Variables starting with I-N default to INTEGER, others to REAL.`,
              suggestion: 'Add IMPLICIT NONE after the program unit header to require explicit declarations.',
            });
          }
          inUnit = true;
          unitStartLine = t.line;
          hasImplicitNone = false;
          const next = tokens[i + 1];
          unitName = (next && next.type === TokenType.IDENTIFIER) ? next.value : '(unnamed)';
        }

        if (t.type === TokenType.IMPLICIT) {
          const next = tokens.slice(i + 1).find(tk => tk.type !== TokenType.NEWLINE && tk.type !== TokenType.COMMENT);
          if (next && next.type === TokenType.NONE) {
            hasImplicitNone = true;
          }
        }

        if (t.type === TokenType.END) {
          if (inUnit && !hasImplicitNone) {
            results.push({
              line: unitStartLine,
              severity: Severity.INFO,
              message: `Program unit '${unitName}' does not use IMPLICIT NONE.`,
              suggestion: 'Add IMPLICIT NONE after the program unit header to require explicit declarations.',
            });
          }
          inUnit = false;
          hasImplicitNone = false;
        }
      }

      return results;
    },
  },

  {
    id: 'STRUCT-004',
    name: 'Duplicate statement label',
    description: 'Statement labels must be unique within a program unit (F77 §3.4)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      const labels = new Map(); // label -> first occurrence line

      for (const t of tokens) {
        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.END) {
          labels.clear();
          continue;
        }

        if (t.type === TokenType.LABEL) {
          const labelVal = t.value;
          if (labels.has(labelVal)) {
            results.push({
              line: t.line,
              column: t.column,
              message: `Duplicate statement label '${labelVal}' (first defined at line ${labels.get(labelVal)}).`,
              suggestion: 'Each statement label must be unique within a program unit.',
            });
          } else {
            labels.set(labelVal, t.line);
          }
        }
      }

      return results;
    },
  },
];

module.exports = programStructureRules;
