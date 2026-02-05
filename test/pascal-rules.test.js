const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createPascalValidator } = require('../src/pascal');

describe('Pascal Validation Rules', () => {
  const validator = createPascalValidator();

  function validate(source, options = {}) {
    return validator.validate(source, options);
  }

  function findRule(diagnostics, ruleId) {
    return diagnostics.filter(d => d.rule === ruleId);
  }

  describe('Structure rules (PAS-STRUCT-*)', () => {
    it('PAS-STRUCT-001: warns on missing program heading', () => {
      const source = 'begin\n  writeln(\'hi\');\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-STRUCT-001').length > 0);
    });

    it('PAS-STRUCT-001: accepts program with heading', () => {
      const source = 'program Test;\nbegin\nend.';
      const { diagnostics } = validate(source);
      assert.strictEqual(findRule(diagnostics, 'PAS-STRUCT-001').length, 0);
    });

    it('PAS-STRUCT-002: detects unmatched BEGIN/END', () => {
      const source = 'program Test;\nbegin\n  begin\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-STRUCT-002').length > 0);
    });

    it('PAS-STRUCT-002: accepts matched BEGIN/END', () => {
      const source = 'program Test;\nbegin\n  begin\n  end;\nend.';
      const { diagnostics } = validate(source);
      assert.strictEqual(findRule(diagnostics, 'PAS-STRUCT-002').length, 0);
    });

    it('PAS-STRUCT-004: detects missing final period', () => {
      const source = 'program Test;\nbegin\nend';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-STRUCT-004').length > 0);
    });
  });

  describe('Control flow rules (PAS-CTRL-*)', () => {
    it('PAS-CTRL-001: flags GOTO usage', () => {
      const source = 'program T;\nlabel 100;\nbegin\n  goto 100;\n  100: writeln;\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-CTRL-001').length > 0);
    });
  });

  describe('Style rules (PAS-STYLE-*)', () => {
    it('PAS-STYLE-003: flags empty BEGIN/END', () => {
      const source = 'program T;\nbegin\n  begin\n  end;\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-STYLE-003').length > 0);
    });

    it('PAS-STYLE-004: flags semicolon before ELSE', () => {
      const source = 'program T;\nbegin\n  if true then\n    x := 1;\n  else\n    x := 2;\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-STYLE-004').length > 0);
    });
  });

  describe('Type rules (PAS-TYPE-*)', () => {
    it('PAS-TYPE-002: flags array without OF', () => {
      const source = 'program T;\nvar x: array[1..10];\nbegin\nend.';
      const { diagnostics } = validate(source);
      assert.ok(findRule(diagnostics, 'PAS-TYPE-002').length > 0);
    });
  });

  describe('Integration', () => {
    it('validates a correct Pascal program with few issues', () => {
      const source = [
        'program Test;',
        'var',
        '  i: integer;',
        'begin',
        '  for i := 1 to 10 do',
        '    writeln(i);',
        'end.',
      ].join('\n');

      const { diagnostics, meta } = validate(source);
      const errors = diagnostics.filter(d => d.severity === 'error');
      assert.strictEqual(errors.length, 0, `Unexpected errors: ${JSON.stringify(errors)}`);
      assert.strictEqual(meta.language, 'pascal');
    });
  });
});
