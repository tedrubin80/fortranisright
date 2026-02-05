const { FortranLexer } = require('../lexer');

/**
 * Severity levels for diagnostics.
 */
const Severity = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  STYLE: 'style',
});

/**
 * A single diagnostic result from validation.
 */
class Diagnostic {
  constructor({ rule, severity, line, column, endLine, endColumn, message, suggestion }) {
    this.rule = rule;           // Rule ID, e.g. "F77-COL-001"
    this.severity = severity;   // Severity level
    this.line = line;           // 1-based line number
    this.column = column ?? 1;  // 1-based column
    this.endLine = endLine;
    this.endColumn = endColumn;
    this.message = message;     // Human-readable explanation
    this.suggestion = suggestion; // Optional fix suggestion
  }
}

/**
 * Rule-based validation engine.
 * Rules are registered and run against parsed source code.
 * No ML — just deterministic checks from the Fortran standard.
 */
class ValidationEngine {
  constructor() {
    this.rules = [];
  }

  /**
   * Register a validation rule.
   * @param {object} rule - Must have: id, name, description, severity, check(context)
   */
  registerRule(rule) {
    if (!rule.id || !rule.check) {
      throw new Error(`Rule must have 'id' and 'check': ${JSON.stringify(rule)}`);
    }
    this.rules.push(rule);
  }

  /**
   * Register multiple rules at once.
   */
  registerRules(rules) {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * Validate Fortran source code.
   * @param {string} source - The Fortran source code
   * @param {object} options - { fixedForm, enabledRules, disabledRules, standard }
   * @returns {{ diagnostics: Diagnostic[], tokens: Token[], meta: object }}
   */
  validate(source, options = {}) {
    const lexer = new FortranLexer(source, { fixedForm: options.fixedForm });
    const tokens = lexer.tokenize();
    const lines = source.split(/\r?\n/);

    const context = {
      source,
      lines,
      tokens,
      lexerDiagnostics: lexer.diagnostics,
      fixedForm: lexer.fixedForm,
      options,
    };

    const diagnostics = [...lexer.diagnostics.map(d => new Diagnostic({
      rule: 'LEXER',
      severity: d.severity,
      line: d.line,
      column: d.column,
      message: d.message,
    }))];

    const enabledRules = options.enabledRules
      ? new Set(options.enabledRules)
      : null;
    const disabledRules = options.disabledRules
      ? new Set(options.disabledRules)
      : new Set();

    for (const rule of this.rules) {
      if (enabledRules && !enabledRules.has(rule.id)) continue;
      if (disabledRules.has(rule.id)) continue;

      try {
        const results = rule.check(context);
        if (results && results.length > 0) {
          for (const r of results) {
            diagnostics.push(new Diagnostic({
              rule: rule.id,
              severity: r.severity ?? rule.severity ?? Severity.WARNING,
              line: r.line,
              column: r.column,
              endLine: r.endLine,
              endColumn: r.endColumn,
              message: r.message,
              suggestion: r.suggestion,
            }));
          }
        }
      } catch (err) {
        diagnostics.push(new Diagnostic({
          rule: rule.id,
          severity: Severity.ERROR,
          line: 1,
          message: `Internal error in rule ${rule.id}: ${err.message}`,
        }));
      }
    }

    // Sort diagnostics by line, then column
    diagnostics.sort((a, b) => (a.line - b.line) || (a.column - b.column));

    const meta = {
      totalLines: lines.length,
      fixedForm: lexer.fixedForm,
      tokenCount: tokens.length,
      ruleCount: this.rules.length,
    };

    return { diagnostics, tokens, meta };
  }

  /**
   * Get list of all registered rules with their metadata.
   */
  listRules() {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      severity: r.severity,
      standard: r.standard,
      category: r.category,
    }));
  }
}

module.exports = { ValidationEngine, Diagnostic, Severity };
