const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * Style and best-practice rules.
 * These go beyond strict standard compliance to catch common
 * pitfalls and encourage maintainable code.
 */

const styleRules = [
  {
    id: 'STYLE-001',
    name: 'Mixed case keywords',
    description: 'Consistent keyword casing improves readability',
    severity: Severity.STYLE,
    standard: 'F77',
    category: 'style',
    check(ctx) {
      const results = [];
      const keywordTokenTypes = new Set([
        TokenType.PROGRAM, TokenType.SUBROUTINE, TokenType.FUNCTION,
        TokenType.END, TokenType.RETURN, TokenType.CALL, TokenType.STOP,
        TokenType.IF, TokenType.THEN, TokenType.ELSE, TokenType.ENDIF,
        TokenType.DO, TokenType.ENDDO, TokenType.CONTINUE, TokenType.GOTO,
        TokenType.READ, TokenType.WRITE, TokenType.PRINT, TokenType.FORMAT,
        TokenType.INTEGER, TokenType.REAL, TokenType.DOUBLE_PRECISION,
        TokenType.COMPLEX, TokenType.LOGICAL, TokenType.CHARACTER,
        TokenType.COMMON, TokenType.DIMENSION, TokenType.DATA,
        TokenType.PARAMETER, TokenType.IMPLICIT, TokenType.SAVE,
      ]);

      let upperCount = 0;
      let lowerCount = 0;
      let mixedTokens = [];

      for (const t of ctx.tokens) {
        if (!keywordTokenTypes.has(t.type)) continue;
        const val = t.value;
        const isUpper = val === val.toUpperCase();
        const isLower = val === val.toLowerCase();

        if (isUpper) upperCount++;
        else if (isLower) lowerCount++;
        else mixedTokens.push(t);
      }

      // Determine dominant style
      const dominant = upperCount >= lowerCount ? 'UPPERCASE' : 'lowercase';

      for (const t of mixedTokens) {
        results.push({
          line: t.line,
          column: t.column,
          severity: Severity.STYLE,
          message: `Keyword '${t.value}' uses mixed case. The codebase predominantly uses ${dominant}.`,
          suggestion: `Use consistent ${dominant} for keywords.`,
        });
      }

      return results;
    },
  },

  {
    id: 'STYLE-002',
    name: 'Deep nesting',
    description: 'Deeply nested control structures reduce readability',
    severity: Severity.STYLE,
    standard: 'F77',
    category: 'style',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;
      const MAX_DEPTH = 5;
      let depth = 0;
      let maxDepthLine = 0;

      let lineTokens = [];
      for (let i = 0; i <= tokens.length; i++) {
        const t = i < tokens.length ? tokens[i] : { type: TokenType.EOF };

        if (t.type === TokenType.NEWLINE || t.type === TokenType.EOF) {
          const meaningful = lineTokens.filter(
            tk => tk.type !== TokenType.COMMENT && tk.type !== TokenType.LABEL && tk.type !== TokenType.WHITESPACE
          );

          if (meaningful.length > 0) {
            const first = meaningful[0];
            const last = meaningful[meaningful.length - 1];

            // Increase depth for IF...THEN and DO
            if ((first.type === TokenType.IF && last.type === TokenType.THEN) ||
                first.type === TokenType.DO) {
              depth++;
              if (depth > MAX_DEPTH) {
                results.push({
                  line: first.line,
                  severity: Severity.STYLE,
                  message: `Nesting depth is ${depth} (exceeds recommended maximum of ${MAX_DEPTH}).`,
                  suggestion: 'Extract deeply nested logic into separate subroutines.',
                });
              }
            }

            // Decrease depth for ENDIF and ENDDO
            if (first.type === TokenType.ENDIF || first.type === TokenType.ENDDO) {
              depth = Math.max(0, depth - 1);
            }

            // Reset at program unit boundaries
            if (first.type === TokenType.END) {
              depth = 0;
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
    id: 'STYLE-003',
    name: 'Long program unit',
    description: 'Program units exceeding recommended line count',
    severity: Severity.INFO,
    standard: 'F77',
    category: 'style',
    check(ctx) {
      const results = [];
      const MAX_LINES = 200;

      let unitStart = 0;
      let unitName = '';
      let inUnit = false;

      for (const t of ctx.tokens) {
        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE || t.type === TokenType.FUNCTION) {
          unitStart = t.line;
          inUnit = true;
          unitName = t.value;
        }

        if (t.type === TokenType.END && inUnit) {
          const length = t.line - unitStart;
          if (length > MAX_LINES) {
            results.push({
              line: unitStart,
              severity: Severity.INFO,
              message: `Program unit starting at line ${unitStart} is ${length} lines long (recommended max: ${MAX_LINES}).`,
              suggestion: 'Consider breaking this into smaller subroutines for maintainability.',
            });
          }
          inUnit = false;
        }
      }

      return results;
    },
  },

  {
    id: 'STYLE-004',
    name: 'Numeric label ordering',
    description: 'Statement labels should increase monotonically for readability',
    severity: Severity.STYLE,
    standard: 'F77',
    category: 'style',
    check(ctx) {
      const results = [];
      let lastLabel = 0;
      let lastLabelLine = 0;

      for (const t of ctx.tokens) {
        // Reset at unit boundaries
        if (t.type === TokenType.PROGRAM || t.type === TokenType.SUBROUTINE ||
            t.type === TokenType.FUNCTION || t.type === TokenType.END) {
          lastLabel = 0;
          continue;
        }

        if (t.type === TokenType.LABEL) {
          const num = parseInt(t.value, 10);
          if (!isNaN(num) && num <= lastLabel) {
            results.push({
              line: t.line,
              severity: Severity.STYLE,
              message: `Label ${num} is not greater than previous label ${lastLabel} (line ${lastLabelLine}). Non-monotonic labels reduce readability.`,
              suggestion: 'Renumber labels in increasing order.',
            });
          }
          if (!isNaN(num)) {
            lastLabel = num;
            lastLabelLine = t.line;
          }
        }
      }

      return results;
    },
  },
];

module.exports = styleRules;
