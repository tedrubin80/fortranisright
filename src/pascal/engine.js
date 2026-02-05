const { Severity, Diagnostic } = require('../engine');
const { PascalLexer } = require('./lexer');

/**
 * Pascal-specific validation engine.
 * Wraps the same rule pattern as the Fortran engine but uses the Pascal lexer.
 */

class PascalValidationEngine {
  constructor() {
    this.rules = [];
  }

  registerRule(rule) {
    if (!rule.id || !rule.check) {
      throw new Error(`Rule must have 'id' and 'check': ${JSON.stringify(rule)}`);
    }
    this.rules.push(rule);
  }

  registerRules(rules) {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  validate(source, options = {}) {
    const lexer = new PascalLexer(source, options);
    const tokens = lexer.tokenize();
    const lines = source.split(/\r?\n/);

    const context = {
      source,
      lines,
      tokens,
      lexerDiagnostics: lexer.diagnostics,
      options,
    };

    const diagnostics = [...lexer.diagnostics.map(d => new Diagnostic({
      rule: 'LEXER',
      severity: d.severity,
      line: d.line,
      column: d.column,
      message: d.message,
    }))];

    const disabledRules = options.disabledRules
      ? new Set(options.disabledRules)
      : new Set();

    for (const rule of this.rules) {
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

    diagnostics.sort((a, b) => (a.line - b.line) || (a.column - b.column));

    const meta = {
      totalLines: lines.length,
      language: 'pascal',
      tokenCount: tokens.length,
      ruleCount: this.rules.length,
    };

    return { diagnostics, tokens, meta };
  }

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

module.exports = { PascalValidationEngine };
