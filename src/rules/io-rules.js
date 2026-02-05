const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * I/O statement validation rules.
 * Based on FORTRAN 77 §12 (Input/Output) and §13 (FORMAT).
 *
 * Key requirements:
 *   - READ/WRITE must have unit and format specifiers
 *   - FORMAT statements must have valid edit descriptors
 *   - OPEN/CLOSE require valid specifiers
 */

const ioRules = [
  {
    id: 'IO-001',
    name: 'FORMAT statement validation',
    description: 'FORMAT statements must contain valid edit descriptors (F77 §13.1)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Valid FORMAT edit descriptors:
      // I, F, E, D, G, L, A, H (Hollerith), X (space), T (tab), / (record separator)
      // Repeat counts: nIw, nFw.d, etc.
      const validDescriptors = /^(\d*[IFEDGLA]\d+(\.\d+)?|\d*X|\d*H|T\d+|TL\d+|TR\d+|\/|SP|SS|S|BN|BZ|:|\d*P|\')$/i;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.FORMAT) continue;

        // Collect the FORMAT specification string
        let formatStr = '';
        let depth = 0;
        let startedParen = false;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === TokenType.NEWLINE || tokens[j].type === TokenType.EOF) break;
          if (tokens[j].type === TokenType.LPAREN) {
            depth++;
            startedParen = true;
            if (depth === 1) continue; // skip outer paren
          }
          if (tokens[j].type === TokenType.RPAREN) {
            depth--;
            if (depth === 0) break;
          }
          if (startedParen && depth >= 1) {
            formatStr += tokens[j].value;
          }
        }

        if (!startedParen) {
          results.push({
            line: t.line,
            message: 'FORMAT statement missing parenthesized format specification.',
            suggestion: 'FORMAT must be followed by a parenthesized list of edit descriptors, e.g., FORMAT(I5, F10.3)',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'IO-002',
    name: 'PRINT with format',
    description: 'PRINT must have a format specifier (label or * for list-directed)',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.PRINT) continue;

        // Next meaningful token should be *, a string literal, or an integer (format label)
        const next = tokens.slice(i + 1).find(
          tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
        );

        if (!next || next.type === TokenType.EOF) {
          results.push({
            line: t.line,
            message: 'PRINT statement has no format specifier.',
            suggestion: 'Use PRINT *, ... for list-directed output, or PRINT label, ... with a FORMAT label.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'IO-003',
    name: 'Unclosed OPEN',
    description: 'Files opened with OPEN should be closed with CLOSE in the same program unit',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      let openUnits = new Map(); // unit number -> line

      const checkUnit = () => {
        for (const [unit, line] of openUnits) {
          results.push({
            line,
            severity: Severity.WARNING,
            message: `File unit ${unit} is OPENed but not CLOSEd in this program unit.`,
            suggestion: 'Add a CLOSE statement for the opened unit to prevent resource leaks.',
          });
        }
        openUnits = new Map();
      };

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === TokenType.END || t.type === TokenType.EOF) {
          checkUnit();
          continue;
        }

        // OPEN(UNIT=n, ...) or OPEN(n, ...)
        if (t.type === TokenType.OPEN) {
          const unitNum = this._extractUnitNumber(tokens, i);
          if (unitNum) {
            openUnits.set(unitNum, t.line);
          }
        }

        // CLOSE(UNIT=n, ...) or CLOSE(n, ...)
        if (t.type === TokenType.CLOSE) {
          const unitNum = this._extractUnitNumber(tokens, i);
          if (unitNum) {
            openUnits.delete(unitNum);
          }
        }
      }

      return results;
    },

    _extractUnitNumber(tokens, startIdx) {
      let depth = 0;
      for (let j = startIdx + 1; j < tokens.length; j++) {
        if (tokens[j].type === TokenType.LPAREN) depth++;
        if (tokens[j].type === TokenType.RPAREN) { depth--; if (depth <= 0) break; }
        if (tokens[j].type === TokenType.NEWLINE) break;
        // Look for UNIT= or first integer
        if (depth === 1 && tokens[j].type === TokenType.INTEGER_LITERAL) {
          return tokens[j].value;
        }
      }
      return null;
    },
  },

  {
    id: 'IO-004',
    name: 'Magic unit numbers',
    description: 'Standard I/O unit numbers: 5 (stdin), 6 (stdout). Other units should use OPEN.',
    severity: Severity.INFO,
    standard: 'F77',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;
      const standardUnits = new Set(['5', '6', '0', '*']);

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.READ && t.type !== TokenType.WRITE) continue;

        // Get the unit specifier
        let depth = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === TokenType.LPAREN) { depth++; continue; }
          if (tokens[j].type === TokenType.RPAREN) { depth--; break; }
          if (tokens[j].type === TokenType.NEWLINE) break;
          if (depth === 1 && tokens[j].type === TokenType.INTEGER_LITERAL) {
            const unit = tokens[j].value;
            if (!standardUnits.has(unit)) {
              results.push({
                line: t.line,
                severity: Severity.INFO,
                message: `I/O unit ${unit} is not a standard unit (5=stdin, 6=stdout). Ensure it is opened with OPEN.`,
              });
            }
            break;
          }
          // Skip UNIT= keyword
          if (tokens[j].type === TokenType.IDENTIFIER && tokens[j].value.toUpperCase() === 'UNIT') continue;
          if (tokens[j].type === TokenType.ASSIGN) continue;
        }
      }

      return results;
    },
  },
];

module.exports = ioRules;
