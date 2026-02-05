const { Severity } = require('../../engine');
const { PascalTokenType } = require('../lexer');

/**
 * Pascal program structure rules.
 * Based on ISO 7185 §6.2 (Blocks), §6.10 (Programs).
 *
 * A valid Pascal program must:
 *   - Begin with PROGRAM heading (Standard Pascal)
 *   - Have declarations in order: LABEL, CONST, TYPE, VAR, procedure/function
 *   - Have a compound statement (BEGIN...END) as the main body
 *   - End with a period (.)
 */

const structureRules = [
  {
    id: 'PAS-STRUCT-001',
    name: 'Missing program heading',
    description: 'Standard Pascal programs must begin with a PROGRAM heading (ISO 7185 §6.10)',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens.filter(t => t.type !== PascalTokenType.COMMENT && t.type !== PascalTokenType.WHITESPACE);

      if (tokens.length > 0 && tokens[0].type !== PascalTokenType.PROGRAM && tokens[0].type !== PascalTokenType.UNIT) {
        results.push({
          line: 1,
          column: 1,
          message: 'Program does not begin with a PROGRAM or UNIT heading.',
          suggestion: "Add 'program ProgramName;' at the start of the file.",
        });
      }

      return results;
    },
  },

  {
    id: 'PAS-STRUCT-002',
    name: 'Unmatched BEGIN/END',
    description: 'Every BEGIN must have a matching END (ISO 7185 §6.8.3.2)',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'structure',
    check(ctx) {
      const results = [];
      const stack = []; // { line, context }

      for (let i = 0; i < ctx.tokens.length; i++) {
        const t = ctx.tokens[i];
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.BEGIN) {
          stack.push({ line: t.line, column: t.column });
        }

        // RECORD also needs END
        if (t.type === PascalTokenType.RECORD) {
          stack.push({ line: t.line, column: t.column, isRecord: true });
        }

        // CASE...OF...END (in variant records and case statements)
        if (t.type === PascalTokenType.CASE) {
          // Only push if this is a standalone CASE statement (not in a record)
          const prev = ctx.tokens.slice(0, i).reverse().find(
            tk => tk.type !== PascalTokenType.COMMENT && tk.type !== PascalTokenType.WHITESPACE
          );
          if (!prev || prev.type !== PascalTokenType.RECORD) {
            stack.push({ line: t.line, column: t.column, isCase: true });
          }
        }

        if (t.type === PascalTokenType.END) {
          if (stack.length === 0) {
            results.push({
              line: t.line,
              column: t.column,
              message: 'END without matching BEGIN, RECORD, or CASE.',
              suggestion: 'Remove this extra END, or add the corresponding BEGIN.',
            });
          } else {
            stack.pop();
          }
        }
      }

      for (const unclosed of stack) {
        const what = unclosed.isRecord ? 'RECORD' : unclosed.isCase ? 'CASE' : 'BEGIN';
        results.push({
          line: unclosed.line,
          column: unclosed.column,
          message: `Unclosed ${what} (started at line ${unclosed.line}). Missing END.`,
          suggestion: `Add 'end' to close the ${what.toLowerCase()} block.`,
        });
      }

      return results;
    },
  },

  {
    id: 'PAS-STRUCT-003',
    name: 'Declaration order violation',
    description: 'Standard Pascal requires declarations in order: LABEL, CONST, TYPE, VAR, procedures/functions (ISO 7185 §6.2.1)',
    severity: Severity.WARNING,
    standard: 'ISO7185',
    category: 'structure',
    check(ctx) {
      const results = [];
      const order = [
        PascalTokenType.LABEL,
        PascalTokenType.CONST,
        PascalTokenType.TYPE,
        PascalTokenType.VAR,
        PascalTokenType.PROCEDURE,
        PascalTokenType.FUNCTION,
      ];
      const orderNames = ['LABEL', 'CONST', 'TYPE', 'VAR', 'PROCEDURE/FUNCTION', 'PROCEDURE/FUNCTION'];
      const orderIdx = new Map(order.map((t, i) => [t, i]));

      let currentOrder = -1;
      let depth = 0; // Track BEGIN/END nesting — only check top-level declarations

      for (const t of ctx.tokens) {
        if (t.type === PascalTokenType.COMMENT) continue;
        if (t.type === PascalTokenType.BEGIN) { depth++; continue; }
        if (t.type === PascalTokenType.END) { depth = Math.max(0, depth - 1); continue; }

        if (depth > 0) continue; // Inside a compound statement — skip

        const idx = orderIdx.get(t.type);
        if (idx !== undefined) {
          // PROCEDURE and FUNCTION share the same position
          const effectiveIdx = (t.type === PascalTokenType.FUNCTION) ? 4 : idx;
          if (effectiveIdx < currentOrder) {
            results.push({
              line: t.line,
              column: t.column,
              message: `'${t.value}' section appears after '${orderNames[currentOrder]}' section. Standard Pascal requires: LABEL, CONST, TYPE, VAR, then procedures/functions.`,
              suggestion: 'Reorder declarations to follow: LABEL → CONST → TYPE → VAR → procedure/function.',
            });
          }
          currentOrder = effectiveIdx;
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STRUCT-004',
    name: 'Missing final period',
    description: 'A Pascal program must end with a period after the final END (ISO 7185 §6.10)',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'structure',
    check(ctx) {
      const results = [];
      const meaningful = ctx.tokens.filter(
        t => t.type !== PascalTokenType.COMMENT && t.type !== PascalTokenType.WHITESPACE && t.type !== PascalTokenType.EOF
      );

      if (meaningful.length > 0) {
        const last = meaningful[meaningful.length - 1];

        // The very last meaningful token should be DOT (the period after END)
        if (last.type !== PascalTokenType.DOT) {
          results.push({
            line: last.line,
            column: last.column,
            message: "Program does not end with a period. Expected 'end.' at the end.",
            suggestion: "Add a period (.) after the final 'end'.",
          });
        }
      }

      return results;
    },
  },

  {
    id: 'PAS-STRUCT-005',
    name: 'Missing semicolons',
    description: 'Statements must be separated by semicolons (ISO 7185 §6.8.3.2)',
    severity: Severity.ERROR,
    standard: 'ISO7185',
    category: 'structure',
    check(ctx) {
      const results = [];
      const tokens = ctx.tokens;

      // Check for common patterns where semicolons are missing:
      // Two consecutive statement-starting keywords without a semicolon between them
      const stmtStarters = new Set([
        PascalTokenType.IF, PascalTokenType.FOR, PascalTokenType.WHILE,
        PascalTokenType.REPEAT, PascalTokenType.WRITE, PascalTokenType.WRITELN,
        PascalTokenType.READ, PascalTokenType.READLN, PascalTokenType.BEGIN,
        PascalTokenType.CASE, PascalTokenType.WITH, PascalTokenType.GOTO,
      ]);

      // Check for END without semicolon before non-END/DOT/ELSE tokens
      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (t.type === PascalTokenType.COMMENT) continue;

        if (t.type === PascalTokenType.END) {
          const next = tokens.slice(i + 1).find(tk => tk.type !== PascalTokenType.COMMENT);
          if (next && next.type !== PascalTokenType.DOT && next.type !== PascalTokenType.SEMICOLON &&
              next.type !== PascalTokenType.ELSE && next.type !== PascalTokenType.END &&
              next.type !== PascalTokenType.EOF && next.type !== PascalTokenType.UNTIL) {
            results.push({
              line: t.line,
              column: t.column,
              message: "Missing semicolon after 'end'.",
              suggestion: "Add ';' after 'end'.",
            });
          }
        }
      }

      return results;
    },
  },
];

module.exports = structureRules;
