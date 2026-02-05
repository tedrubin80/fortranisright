const { Severity } = require('../../engine');
const { PascalTokenType } = require('../lexer');

/**
 * Pascal type and declaration rules.
 * Based on ISO 7185 §6.4 (Types), §6.5 (Declarations), §6.6 (Procedures/Functions).
 *
 * Key requirements:
 *   - All variables must be declared before use
 *   - Type compatibility in assignments
 *   - Array bounds must be ordinal types
 *   - Proper VAR/value parameter distinction
 */

const typeRules = [
  {
    id: 'PAS-TYPE-001',
    name: 'Identifier length',
    description: 'Standard Pascal requires only the first 8 characters of identifiers to be significant',
    severity: Severity.INFO,
    standard: 'ISO7185',
    category: 'types',
    check(ctx) {
      const results = [];
      const seen = new Set();
      const limit = ctx.options.standard === 'turbo' ? 63 : 8;

      for (const t of ctx.tokens) {
        if (t.type === PascalTokenType.IDENTIFIER) {
          if (t.value.length > limit && !seen.has(t.value)) {
            seen.add(t.value);
            results.push({
              line: t.line,
              column: t.column,
              severity: Severity.INFO,
              message: `Identifier '${t.value}' is ${t.value.length} characters. Only the first ${limit} are significant in ${ctx.options.standard === 'turbo' ? 'Turbo Pascal' : 'Standard Pascal'}.`,
              suggestion: `Ensure identifiers are distinguishable within the first ${limit} characters.`,
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-TYPE-002',
    name: 'Array syntax validation',
    description: 'Array declarations must use ARRAY[index-type] OF element-type (ISO 7185 §6.4.3.2)',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'types',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.ARRAY) continue;

        // Expect [ or LBRACKET next
        const next = tokens.slice(i + 1).find(t => t.type !== PascalTokenType.COMMENT);
        if (!next || next.type !== PascalTokenType.LBRACKET) {
          results.push({
            line: tokens[i].line,
            column: tokens[i].column,
            message: "ARRAY must be followed by '[' (index type specification).",
            suggestion: "Use syntax: array[1..10] of integer",
          });
          continue;
        }

        // Find the matching ] and check for OF after it
        let depth = 0;
        let foundOf = false;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === PascalTokenType.LBRACKET) depth++;
          if (tokens[j].type === PascalTokenType.RBRACKET) {
            depth--;
            if (depth === 0) {
              const afterBracket = tokens.slice(j + 1).find(t => t.type !== PascalTokenType.COMMENT);
              if (afterBracket && afterBracket.type === PascalTokenType.OF) {
                foundOf = true;
              }
              break;
            }
          }
          if (tokens[j].type === PascalTokenType.SEMICOLON || tokens[j].type === PascalTokenType.EOF) break;
        }

        if (!foundOf) {
          results.push({
            line: tokens[i].line,
            column: tokens[i].column,
            message: "ARRAY declaration missing 'of' keyword after index specification.",
            suggestion: "Use syntax: array[1..10] of integer",
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-TYPE-003',
    name: 'Procedure/function parameter list',
    description: 'Procedure/function declarations should have properly formed parameter lists',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'types',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== PascalTokenType.PROCEDURE && t.type !== PascalTokenType.FUNCTION) continue;

        // Next should be identifier (name)
        const name = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
        if (!name || name.type !== PascalTokenType.IDENTIFIER) {
          results.push({
            line: t.line,
            column: t.column,
            message: `${t.value} declaration missing name.`,
            suggestion: `Add an identifier after '${t.value}'.`,
          });
          continue;
        }

        // If FUNCTION, should eventually have a return type after ): type
        if (t.type === PascalTokenType.FUNCTION) {
          let foundColon = false;
          let foundSemicolon = false;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === PascalTokenType.SEMICOLON) { foundSemicolon = true; break; }
            if (tokens[j].type === PascalTokenType.COLON) foundColon = true;
          }
          if (!foundColon && foundSemicolon) {
            results.push({
              line: t.line,
              column: t.column,
              message: `Function '${name.value}' has no return type declaration.`,
              suggestion: "Add return type: function Name(params): ReturnType;",
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-TYPE-004',
    name: 'Undeclared variable usage',
    description: 'Variables should be declared in a VAR section before use',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'types',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Collect declared identifiers
      const declared = new Set();
      // Built-in identifiers
      const builtins = new Set([
        'true', 'false', 'maxint', 'input', 'output',
        'integer', 'real', 'boolean', 'char', 'string', 'text',
        'abs', 'sqr', 'sqrt', 'sin', 'cos', 'arctan', 'exp', 'ln',
        'ord', 'chr', 'succ', 'pred', 'odd', 'eof', 'eoln',
        'trunc', 'round', 'length', 'copy', 'pos', 'concat',
        'inc', 'dec', 'new', 'dispose', 'halt', 'random', 'randomize',
        'sizeof', 'high', 'low', 'assigned', 'str', 'val',
        'write', 'writeln', 'read', 'readln',
      ]);

      let inVar = false;
      let inConst = false;
      let inType = false;
      let inBody = false;
      let depth = 0;

      // Phase 1: collect declarations
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.PROGRAM || t.type === PascalTokenType.PROCEDURE ||
            t.type === PascalTokenType.FUNCTION) {
          const nameToken = tokens.slice(i + 1).find(tk => tk.type === PascalTokenType.IDENTIFIER);
          if (nameToken) declared.add(nameToken.value.toLowerCase());

          // Collect parameter names
          let inParams = false;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === PascalTokenType.LPAREN) { inParams = true; continue; }
            if (tokens[j].type === PascalTokenType.RPAREN) { inParams = false; break; }
            if (tokens[j].type === PascalTokenType.SEMICOLON && !inParams) break;
            if (inParams && tokens[j].type === PascalTokenType.IDENTIFIER) {
              // Check if this is a parameter name (before :) or type name (after :)
              const next = tokens.slice(j + 1).find(tk =>
                tk.type !== PascalTokenType.COMMENT && tk.type !== PascalTokenType.COMMA
              );
              if (next && (next.type === PascalTokenType.COLON || next.type === PascalTokenType.COMMA)) {
                declared.add(tokens[j].value.toLowerCase());
              }
            }
          }
        }

        if (t.type === PascalTokenType.VAR) { inVar = true; inConst = false; inType = false; }
        if (t.type === PascalTokenType.CONST) { inConst = true; inVar = false; inType = false; }
        if (t.type === PascalTokenType.TYPE) { inType = true; inVar = false; inConst = false; }
        if (t.type === PascalTokenType.BEGIN || t.type === PascalTokenType.PROCEDURE ||
            t.type === PascalTokenType.FUNCTION) {
          inVar = false; inConst = false; inType = false;
        }

        if (inVar || inConst || inType) {
          if (t.type === PascalTokenType.IDENTIFIER) {
            declared.add(t.value.toLowerCase());
          }
        }

        // FOR loop variables
        if (t.type === PascalTokenType.FOR) {
          const next = tokens.slice(i + 1).find(tk => tk.type === PascalTokenType.IDENTIFIER);
          if (next) declared.add(next.value.toLowerCase());
        }
      }

      // Phase 2: check usage in body (simplified — flag undeclared identifiers on left side of :=)
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== PascalTokenType.IDENTIFIER) continue;

        const lower = t.value.toLowerCase();
        if (declared.has(lower) || builtins.has(lower)) continue;

        // Check if it's being assigned to
        const next = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
        if (next && next.type === PascalTokenType.ASSIGN) {
          results.push({
            line: t.line,
            column: t.column,
            severity: Severity.WARNING,
            message: `Variable '${t.value}' is used but may not be declared in a VAR section.`,
            suggestion: `Declare '${t.value}' in a VAR section before use.`,
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-TYPE-005',
    name: 'Record field access',
    description: 'Record field access should use dot notation',
    severity: Severity.INFO,
    standard: 'ISO7185',
    category: 'types',
    check(ctx) {
      const results = [];

      // Detect WITH statements and suggest careful usage
      for (const t of ctx.tokens) {
        if (t.type === PascalTokenType.WITH) {
          results.push({
            line: t.line,
            column: t.column,
            severity: Severity.INFO,
            message: "WITH statement found. WITH can make code harder to read by obscuring which record fields are being accessed.",
            suggestion: 'Consider using explicit record.field notation for clarity.',
          });
        }
      }

      return results;
    },
  },
];

module.exports = typeRules;
