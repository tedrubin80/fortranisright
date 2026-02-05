const { Severity } = require('../../engine');
const { PascalTokenType } = require('../lexer');

/**
 * Pascal I/O rules.
 * Based on ISO 7185 §6.9 (Input/Output), §6.6.5 (Required procedures/functions).
 *
 * Standard I/O procedures: read, readln, write, writeln
 * File handling: reset, rewrite, assign (Turbo Pascal)
 */

const ioRules = [
  {
    id: 'PAS-IO-001',
    name: 'Write/WriteLn format specifiers',
    description: 'WriteLn with field width specifiers should use valid syntax: Write(value:width:decimals)',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== PascalTokenType.WRITE && t.type !== PascalTokenType.WRITELN) continue;

        // Check for parenthesized argument list
        const next = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
        if (!next || next.type !== PascalTokenType.LPAREN) {
          if (t.type === PascalTokenType.WRITELN) continue; // WriteLn without args is valid (newline)
          results.push({
            line: t.line,
            column: t.column,
            message: `${t.value} without arguments or parentheses.`,
            suggestion: `Use ${t.value}(arguments) or ${t.value}ln for a blank line.`,
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-IO-002',
    name: 'Read/ReadLn usage',
    description: 'Read/ReadLn should have variable arguments to read into',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== PascalTokenType.READ && t.type !== PascalTokenType.READLN) continue;

        const next = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
        if (next && next.type === PascalTokenType.LPAREN) {
          // Check if there's at least one identifier in the argument list
          let hasIdent = false;
          let depth = 0;
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === PascalTokenType.LPAREN) depth++;
            if (tokens[j].type === PascalTokenType.RPAREN) { depth--; if (depth === 0) break; }
            if (tokens[j].type === PascalTokenType.IDENTIFIER) hasIdent = true;
          }
          if (!hasIdent) {
            results.push({
              line: t.line,
              column: t.column,
              message: `${t.value} has no variable arguments to read into.`,
              suggestion: `Provide variable names: ${t.value}(varName)`,
            });
          }
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-IO-003',
    name: 'Program file parameters',
    description: 'Standard Pascal programs should declare input/output in the program heading (ISO 7185 §6.10)',
    severity: Severity.INFO,
    standard: 'ISO7185',
    category: 'io',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Check if program heading has (input, output) or (output)
      let hasProgram = false;
      let hasFileParams = false;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== PascalTokenType.PROGRAM) continue;
        hasProgram = true;

        // Look for (input, output) after program name
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === PascalTokenType.LPAREN) {
            hasFileParams = true;
            break;
          }
          if (tokens[j].type === PascalTokenType.SEMICOLON) break;
        }
        break;
      }

      // Check if program uses I/O
      const usesIO = tokens.some(t =>
        t.type === PascalTokenType.READ || t.type === PascalTokenType.READLN ||
        t.type === PascalTokenType.WRITE || t.type === PascalTokenType.WRITELN
      );

      if (hasProgram && usesIO && !hasFileParams) {
        results.push({
          line: 1,
          severity: Severity.INFO,
          message: "Program uses I/O but does not declare file parameters in the program heading.",
          suggestion: "Add file parameters: program Name(input, output);",
        });
      }

      return results;
    },
  },
];

module.exports = ioRules;
