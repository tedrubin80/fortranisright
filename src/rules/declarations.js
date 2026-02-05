const { Severity } = require('../engine');
const { TokenType } = require('../lexer');

/**
 * Declaration and type rules.
 * Based on FORTRAN 77 §8 (Type rules, COMMON, EQUIVALENCE, DATA)
 * and Fortran 90 §5 (Type declarations, attributes).
 *
 * Key rules from the manual:
 *   - Variable names max 6 characters (F77) or 31 characters (F90)
 *   - Implicit typing: I-N → INTEGER, all others → REAL
 *   - COMMON block alignment requirements
 *   - DATA statement restrictions
 */

const declarationRules = [
  {
    id: 'DECL-001',
    name: 'Variable name length',
    description: 'FORTRAN 77 limits identifiers to 6 characters; Fortran 90 allows 31',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'declarations',
    check(ctx) {
      const results = [];
      const limit = ctx.options.standard === 'F90' ? 31 : 6;
      const seen = new Set();

      for (const t of ctx.tokens) {
        if (t.type === TokenType.IDENTIFIER) {
          const name = t.value;
          if (name.length > limit && !seen.has(name)) {
            seen.add(name);
            results.push({
              line: t.line,
              column: t.column,
              message: `Identifier '${name}' is ${name.length} characters long; ${ctx.options.standard === 'F90' ? 'Fortran 90' : 'FORTRAN 77'} limits names to ${limit} characters.`,
              suggestion: `Shorten the name to ${limit} characters or less, or use a later Fortran standard.`,
            });
          }
        }
      }
      return results;
    },
  },

  {
    id: 'DECL-002',
    name: 'COMMON block mixed types',
    description: 'CHARACTER and non-CHARACTER data should not be mixed in the same COMMON block (F77 §8.3.3)',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'declarations',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Track declared variable types
      const varTypes = new Map();
      const charTypes = new Set([TokenType.CHARACTER]);
      const numTypes = new Set([
        TokenType.INTEGER, TokenType.REAL, TokenType.DOUBLE_PRECISION,
        TokenType.COMPLEX, TokenType.LOGICAL,
      ]);

      // First pass: collect type declarations
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (charTypes.has(t.type) || numTypes.has(t.type)) {
          const isChar = charTypes.has(t.type);
          // Scan following identifiers
          for (let j = i + 1; j < tokens.length; j++) {
            const next = tokens[j];
            if (next.type === TokenType.NEWLINE || next.type === TokenType.EOF) break;
            if (next.type === TokenType.IDENTIFIER) {
              varTypes.set(next.value.toUpperCase(), isChar ? 'CHARACTER' : 'NUMERIC');
            }
          }
        }
      }

      // Second pass: check COMMON blocks
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.COMMON) continue;

        const commonVars = [];
        let blockName = '(blank)';

        for (let j = i + 1; j < tokens.length; j++) {
          const next = tokens[j];
          if (next.type === TokenType.NEWLINE || next.type === TokenType.EOF) break;
          // Named block: / name /
          if (next.type === TokenType.SLASH) {
            const nameToken = tokens[j + 1];
            if (nameToken && nameToken.type === TokenType.IDENTIFIER) {
              blockName = nameToken.value;
            }
            continue;
          }
          if (next.type === TokenType.IDENTIFIER) {
            commonVars.push({ name: next.value, line: next.line });
          }
        }

        // Check for mixed types
        let hasChar = false;
        let hasNum = false;
        for (const v of commonVars) {
          const vType = varTypes.get(v.name.toUpperCase());
          if (vType === 'CHARACTER') hasChar = true;
          else hasNum = true;
        }

        if (hasChar && hasNum) {
          results.push({
            line: t.line,
            message: `COMMON block '${blockName}' mixes CHARACTER and non-CHARACTER variables. This is prohibited by F77 §8.3.3.`,
            suggestion: 'Separate CHARACTER variables into their own COMMON block.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'DECL-003',
    name: 'Label range validation',
    description: 'Statement labels must be between 1 and 99999 (F77 §3.4)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'declarations',
    check(ctx) {
      const results = [];
      for (const t of ctx.tokens) {
        if (t.type === TokenType.LABEL) {
          const num = parseInt(t.value, 10);
          if (isNaN(num) || num < 1 || num > 99999) {
            results.push({
              line: t.line,
              column: t.column,
              message: `Statement label '${t.value}' is out of range. Labels must be 1-99999.`,
              suggestion: 'Use a numeric label between 1 and 99999.',
            });
          }
        }
      }
      return results;
    },
  },

  {
    id: 'DECL-004',
    name: 'EQUIVALENCE with COMMON restriction',
    description: 'EQUIVALENCE must not cause a COMMON block to be extended at the lower end (F77 §8.2.4)',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'declarations',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect COMMON variables
      const commonVars = new Set();
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.COMMON) {
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === TokenType.NEWLINE || tokens[j].type === TokenType.EOF) break;
            if (tokens[j].type === TokenType.IDENTIFIER) {
              commonVars.add(tokens[j].value.toUpperCase());
            }
          }
        }
      }

      // Check EQUIVALENCE statements
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === TokenType.EQUIVALENCE) {
          const equivVars = [];
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === TokenType.NEWLINE || tokens[j].type === TokenType.EOF) break;
            if (tokens[j].type === TokenType.IDENTIFIER) {
              equivVars.push(tokens[j].value.toUpperCase());
            }
          }

          const hasCommon = equivVars.some(v => commonVars.has(v));
          const hasNonCommon = equivVars.some(v => !commonVars.has(v));

          if (hasCommon && hasNonCommon) {
            results.push({
              line: tokens[i].line,
              severity: Severity.WARNING,
              message: 'EQUIVALENCE associates COMMON and non-COMMON variables. Ensure this does not extend the COMMON block below its first element.',
              suggestion: 'Review the storage sequence to verify COMMON block boundaries are not violated.',
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'DECL-005',
    name: 'Unused labels',
    description: 'Statement labels that are defined but never referenced',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'declarations',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect label definitions and references per program unit
      let labelDefs = new Map(); // label -> line
      let labelRefs = new Set();

      const checkUnit = () => {
        for (const [label, line] of labelDefs) {
          // FORMAT labels are commonly referenced in READ/WRITE — skip checking those
          // for simplicity. Check non-FORMAT labels.
          if (!labelRefs.has(label)) {
            results.push({
              line,
              severity: Severity.WARNING,
              message: `Statement label '${label}' is defined but never referenced.`,
              suggestion: 'Remove the unused label, or verify it is needed.',
            });
          }
        }
        labelDefs = new Map();
        labelRefs = new Set();
      };

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.type === TokenType.END || t.type === TokenType.EOF) {
          checkUnit();
          continue;
        }

        if (t.type === TokenType.LABEL) {
          labelDefs.set(t.value, t.line);
        }

        // References: GOTO label, DO label, FORMAT references in READ/WRITE
        if (t.type === TokenType.GOTO || t.type === TokenType.DO) {
          const next = tokens.slice(i + 1).find(
            tk => tk.type !== TokenType.WHITESPACE && tk.type !== TokenType.NEWLINE
          );
          if (next && next.type === TokenType.INTEGER_LITERAL) {
            labelRefs.add(next.value);
          }
        }

        // READ/WRITE with format label
        if (t.type === TokenType.READ || t.type === TokenType.WRITE) {
          // Scan for integer literals in the parenthesized argument list
          let depth = 0;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === TokenType.LPAREN) depth++;
            if (tokens[j].type === TokenType.RPAREN) { depth--; if (depth <= 0) break; }
            if (tokens[j].type === TokenType.INTEGER_LITERAL && depth > 0) {
              labelRefs.add(tokens[j].value);
            }
            if (tokens[j].type === TokenType.NEWLINE) break;
          }
        }
      }

      return results;
    },
  },
];

module.exports = declarationRules;
