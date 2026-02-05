const { Severity } = require('../engine');

/**
 * Fixed-form column layout rules (ANSI X3.9-1978 / FORTRAN 77).
 *
 * Per the standard:
 *   - Column 1: Comment indicator (C, c, *, !)
 *   - Columns 1-5: Statement label field (digits or blank)
 *   - Column 6: Continuation indicator (non-blank, non-zero)
 *   - Columns 7-72: Statement field
 *   - Columns 73+: Identification/sequence field (ignored by compiler)
 */

const columnLayoutRules = [
  {
    id: 'F77-COL-001',
    name: 'Line exceeds 72 columns',
    description: 'Fixed-form Fortran lines must not exceed 72 columns (cols 73+ are sequence numbers)',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'layout',
    check(ctx) {
      if (!ctx.fixedForm) return [];
      const results = [];
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        // Skip empty lines and pure comment lines
        if (line.trim().length === 0) continue;
        const firstChar = line[0];
        if (firstChar === 'C' || firstChar === 'c' || firstChar === '*' || firstChar === '!') continue;

        if (line.length > 72) {
          const overshoot = line.substring(72).trim();
          if (overshoot.length > 0) {
            results.push({
              line: i + 1,
              column: 73,
              message: `Line extends to column ${line.length}; columns 73+ are ignored in fixed-form. Content beyond col 72: "${overshoot}"`,
              suggestion: 'Move statement content within columns 7-72, or use continuation lines.',
            });
          }
        }
      }
      return results;
    },
  },

  {
    id: 'F77-COL-002',
    name: 'Invalid label field',
    description: 'Columns 1-5 must contain only digits or blanks (label field)',
    severity: Severity.ERROR,
    standard: 'F77',
    category: 'layout',
    check(ctx) {
      if (!ctx.fixedForm) return [];
      const results = [];
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (line.trim().length === 0) continue;
        const firstChar = line[0];
        if (firstChar === 'C' || firstChar === 'c' || firstChar === '*' || firstChar === '!') continue;

        // Check continuation line (col 6 non-blank) — label field must still be blank
        const isContinuation = line.length >= 6 && line[5] !== ' ' && line[5] !== '0';

        const labelField = line.substring(0, Math.min(5, line.length));
        for (let j = 0; j < labelField.length; j++) {
          const ch = labelField[j];
          if (ch !== ' ' && (ch < '0' || ch > '9')) {
            // Tab in column 1 is a common extension — warn instead of error
            if (ch === '\t') {
              results.push({
                line: i + 1,
                column: j + 1,
                severity: Severity.WARNING,
                message: `Tab character in label field (col ${j + 1}). Tabs are a non-standard extension.`,
                suggestion: 'Use spaces in columns 1-5 for portability.',
              });
            } else {
              results.push({
                line: i + 1,
                column: j + 1,
                message: `Invalid character '${ch}' in label field (col ${j + 1}). Only digits and blanks allowed.`,
                suggestion: 'Labels must be numeric (1-99999) in columns 1-5.',
              });
            }
          }
        }

        // Continuation lines must have blank label field
        if (isContinuation && labelField.trim().length > 0) {
          results.push({
            line: i + 1,
            column: 1,
            message: 'Continuation line has non-blank label field. Labels are not allowed on continuation lines.',
            suggestion: 'Remove the label from the continuation line.',
          });
        }
      }
      return results;
    },
  },

  {
    id: 'F77-COL-003',
    name: 'Statement in label field',
    description: 'Statement code should not appear in columns 1-6 of non-comment lines',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'layout',
    check(ctx) {
      if (!ctx.fixedForm) return [];
      const results = [];
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (line.trim().length === 0) continue;
        const firstChar = line[0];
        if (firstChar === 'C' || firstChar === 'c' || firstChar === '*' || firstChar === '!') continue;

        // If line is shorter than 7 characters but has non-blank content
        if (line.length < 7 && line.trim().length > 0) {
          const labelField = line.substring(0, Math.min(5, line.length)).trim();
          // If it's not a valid numeric label, warn
          if (labelField.length > 0 && !/^\d+$/.test(labelField)) {
            results.push({
              line: i + 1,
              column: 1,
              message: 'Non-numeric content in columns 1-5 without reaching the statement field (col 7+).',
              suggestion: 'Ensure code starts at column 7 or later. Use columns 1-5 only for numeric labels.',
            });
          }
        }
      }
      return results;
    },
  },

  {
    id: 'F77-COL-004',
    name: 'Continuation limit exceeded',
    description: 'FORTRAN 77 allows a maximum of 19 continuation lines per statement',
    severity: Severity.WARNING,
    standard: 'F77',
    category: 'layout',
    check(ctx) {
      if (!ctx.fixedForm) return [];
      const results = [];
      let continuationCount = 0;
      let stmtStartLine = 0;

      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (line.trim().length === 0) {
          continuationCount = 0;
          continue;
        }
        const firstChar = line[0];
        if (firstChar === 'C' || firstChar === 'c' || firstChar === '*' || firstChar === '!') continue;

        const isContinuation = line.length >= 6 && line[5] !== ' ' && line[5] !== '0';

        if (isContinuation) {
          continuationCount++;
          if (continuationCount > 19) {
            results.push({
              line: i + 1,
              column: 6,
              message: `Continuation line count (${continuationCount}) exceeds the FORTRAN 77 limit of 19.`,
              suggestion: 'Refactor the statement to reduce continuation lines, or use Fortran 90 free-form.',
            });
          }
        } else {
          continuationCount = 0;
          stmtStartLine = i + 1;
        }
      }
      return results;
    },
  },
];

module.exports = columnLayoutRules;
