const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ValidationEngine, Severity } = require('../src/engine');

describe('ValidationEngine', () => {
  it('registers and runs rules', () => {
    const engine = new ValidationEngine();
    engine.registerRule({
      id: 'TEST-001',
      name: 'Test rule',
      severity: Severity.WARNING,
      check(ctx) {
        return [{ line: 1, message: 'Test issue' }];
      },
    });

    const result = engine.validate('      END', { fixedForm: true });
    assert.ok(result.diagnostics.length > 0);
    assert.strictEqual(result.diagnostics[0].rule, 'TEST-001');
  });

  it('skips disabled rules', () => {
    const engine = new ValidationEngine();
    engine.registerRule({
      id: 'TEST-001',
      check(ctx) { return [{ line: 1, message: 'Should not appear' }]; },
    });

    const result = engine.validate('      END', {
      fixedForm: true,
      disabledRules: ['TEST-001'],
    });

    const testDiags = result.diagnostics.filter(d => d.rule === 'TEST-001');
    assert.strictEqual(testDiags.length, 0);
  });

  it('catches rule errors gracefully', () => {
    const engine = new ValidationEngine();
    engine.registerRule({
      id: 'BROKEN-001',
      check() { throw new Error('Rule crashed'); },
    });

    const result = engine.validate('      END', { fixedForm: true });
    const errorDiag = result.diagnostics.find(d => d.rule === 'BROKEN-001');
    assert.ok(errorDiag);
    assert.ok(errorDiag.message.includes('Internal error'));
  });

  it('returns sorted diagnostics', () => {
    const engine = new ValidationEngine();
    engine.registerRule({
      id: 'TEST-A',
      check() { return [{ line: 5, message: 'Later' }]; },
    });
    engine.registerRule({
      id: 'TEST-B',
      check() { return [{ line: 1, message: 'Earlier' }]; },
    });

    const result = engine.validate('      PROGRAM T\n      END', { fixedForm: true });
    const testDiags = result.diagnostics.filter(d => d.rule.startsWith('TEST-'));
    assert.ok(testDiags[0].line <= testDiags[1].line);
  });

  it('lists registered rules', () => {
    const engine = new ValidationEngine();
    engine.registerRule({
      id: 'LIST-001',
      name: 'Listable',
      description: 'A rule',
      severity: Severity.INFO,
      check() { return []; },
    });

    const rules = engine.listRules();
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].id, 'LIST-001');
  });

  it('provides meta information', () => {
    const engine = new ValidationEngine();
    const result = engine.validate('      PROGRAM T\n      END\n', { fixedForm: true });
    assert.ok(result.meta);
    assert.strictEqual(result.meta.totalLines, 3);
    assert.strictEqual(result.meta.fixedForm, true);
  });
});
