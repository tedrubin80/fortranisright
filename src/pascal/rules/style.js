const { Severity } = require('../../engine');
const { PascalTokenType } = require('../lexer');

/**
 * Pascal style and best-practice rules.
 * Goes beyond strict ISO 7185 compliance to catch common
 * pitfalls and encourage maintainable code.
 */

const styleRules = [
  {
    id: 'PAS-STYLE-001',
    name: 'Inconsistent casing',
    description: 'Pascal identifiers are case-insensitive; consistent casing improves readability',
    severity: Severity.STYLE,
    standard: 'ISO7185',
    category: 'style',
    check(ctx) {
      const results = [];
      // Track identifier casings
      const identCases = new Map(); // lowercase -> [{ value, line }]

      for (const t of ctx.tokens) {
        if (t.type !== PascalTokenType.IDENTIFIER) continue;
        const lower = t.value.toLowerCase();
        if (!identCases.has(lower)) {
          identCases.set(lower, []);
        }
        identCases.get(lower).push({ value: t.value, line: t.line, column: t.column });
      }

      for (const [lower, usages] of identCases) {
        if (usages.length < 2) continue;
        const casings = new Set(usages.map(u => u.value));
        if (casings.size > 1) {
          const casingList = [...casings].join(', ');
          // Report on second occurrence
          results.push({
            line: usages[1].line,
            column: usages[1].column,
            severity: Severity.STYLE,
            message: `Identifier '${lower}' used with inconsistent casing: ${casingList}`,
            suggestion: 'Pick one casing style and use it consistently.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STYLE-002',
    name: 'Long procedure/function',
    description: 'Procedures and functions exceeding recommended line count',
    severity: Severity.INFO,
    standard: 'ISO7185',
    category: 'style',
    check(ctx) {
      const results = [];
      const MAX_LINES = 100;
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== PascalTokenType.PROCEDURE && t.type !== PascalTokenType.FUNCTION) continue;

        const name = tokens.slice(i + 1).find(tk => tk.type === PascalTokenType.IDENTIFIER);
        const startLine = t.line;

        // Find matching BEGIN/END pair for this routine
        let depth = 0;
        let foundBegin = false;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === PascalTokenType.BEGIN) {
            depth++;
            if (!foundBegin) foundBegin = true;
          }
          if (tokens[j].type === PascalTokenType.END) {
            depth--;
            if (foundBegin && depth === 0) {
              const length = tokens[j].line - startLine;
              if (length > MAX_LINES) {
                results.push({
                  line: startLine,
                  severity: Severity.INFO,
                  message: `${t.value} '${name ? name.value : '(unnamed)'}' is ${length} lines long (recommended max: ${MAX_LINES}).`,
                  suggestion: 'Consider breaking this into smaller procedures/functions.',
                });
              }
              break;
            }
          }
          // If we hit another procedure/function at the same level, stop
          if (depth === 0 && (tokens[j].type === PascalTokenType.PROCEDURE || tokens[j].type === PascalTokenType.FUNCTION)) {
            break;
          }
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STYLE-003',
    name: 'Empty BEGIN/END block',
    description: 'Empty compound statements may indicate incomplete code',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'style',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.BEGIN) continue;

        const next = tokens.slice(i + 1).find(t => t.type !== PascalTokenType.COMMENT);
        if (next && next.type === PascalTokenType.END) {
          results.push({
            line: tokens[i].line,
            column: tokens[i].column,
            message: 'Empty BEGIN/END block.',
            suggestion: 'Add statements or remove the empty block.',
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STYLE-004',
    name: 'Semicolon before ELSE',
    description: 'A semicolon before ELSE causes an empty statement, which is technically valid but usually a bug',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'style',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.ELSE) continue;

        // Look back for the nearest non-comment token
        const prev = tokens.slice(0, i).reverse().find(t => t.type !== PascalTokenType.COMMENT);
        if (prev && prev.type === PascalTokenType.SEMICOLON) {
          results.push({
            line: prev.line,
            column: prev.column,
            message: "Semicolon immediately before 'else'. In Pascal, semicolon separates statements — this creates an empty statement and may cause a compilation error in strict mode.",
            suggestion: "Remove the semicolon before 'else'.",
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STYLE-005',
    name: 'Magic numbers',
    description: 'Numeric literals in code should use named constants for clarity',
    severity: Severity.INFO,
    standard: 'ISO7185',
    category: 'style',
    check(ctx) {
      const results = [];
      const SAFE_NUMBERS = new Set(['0', '1', '2', '-1', '0.0', '1.0']);
      const seen = new Set();

      let inConst = false;
      let inType = false;
      let inArray = false;

      for (let i = 0; i < ctx.tokens.length; i++) {
        const t = ctx.tokens[i];
        if (t.type === PascalTokenType.CONST) { inConst = true; inType = false; }
        if (t.type === PascalTokenType.TYPE) { inType = true; inConst = false; }
        if (t.type === PascalTokenType.VAR || t.type === PascalTokenType.BEGIN ||
            t.type === PascalTokenType.PROCEDURE || t.type === PascalTokenType.FUNCTION) {
          inConst = false; inType = false;
        }
        if (t.type === PascalTokenType.ARRAY) inArray = true;
        if (t.type === PascalTokenType.OF) inArray = false;

        // Skip const declarations, type definitions, and array bounds
        if (inConst || inType || inArray) continue;

        if (t.type === PascalTokenType.INTEGER_LITERAL || t.type === PascalTokenType.REAL_LITERAL) {
          if (!SAFE_NUMBERS.has(t.value) && !seen.has(t.value)) {
            // Check if it's inside a WRITE/WRITELN format — those are okay
            const prevKw = ctx.tokens.slice(Math.max(0, i - 5), i).find(
              tk => tk.type === PascalTokenType.WRITE || tk.type === PascalTokenType.WRITELN
            );
            if (prevKw) continue;

            seen.add(t.value);
            results.push({
              line: t.line,
              column: t.column,
              severity: Severity.INFO,
              message: `Magic number '${t.value}' — consider using a named constant.`,
              suggestion: `Define a constant: const SomeName = ${t.value};`,
            });
          }
        }
      }

      return results;
    },
  },
];

module.exports = styleRules;
