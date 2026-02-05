const { describe, it } = require('node:test');
const assert = require('node:assert');
const { FortranLexer, TokenType } = require('../src/lexer');

describe('FortranLexer', () => {
  describe('fixed-form detection', () => {
    it('detects fixed-form from C-style comments', () => {
      const lexer = new FortranLexer('C     THIS IS A COMMENT\n      PROGRAM TEST\n      END');
      assert.strictEqual(lexer.fixedForm, true);
    });

    it('detects free-form from & continuation', () => {
      const lexer = new FortranLexer('program test\n  integer :: x = &\n    10\nend program');
      assert.strictEqual(lexer.fixedForm, false);
    });
  });

  describe('fixed-form tokenization', () => {
    it('tokenizes a simple program', () => {
      const source = '      PROGRAM HELLO\n      END';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const types = tokens.map(t => t.type).filter(t => t !== TokenType.NEWLINE && t !== TokenType.EOF);
      assert.deepStrictEqual(types, [TokenType.PROGRAM, TokenType.IDENTIFIER, TokenType.END]);
    });

    it('extracts labels from columns 1-5', () => {
      const source = '  100 FORMAT(I5)';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const label = tokens.find(t => t.type === TokenType.LABEL);
      assert.ok(label);
      assert.strictEqual(label.value, '100');
    });

    it('handles comment lines', () => {
      const source = 'C     THIS IS A COMMENT\n      END';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const comments = tokens.filter(t => t.type === TokenType.COMMENT);
      assert.strictEqual(comments.length, 1);
    });

    it('handles continuation lines', () => {
      const source = '      X = 1 +\n     &    2';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
      assert.strictEqual(ids.length, 1);
      assert.strictEqual(ids[0].value, 'X');
    });
  });

  describe('token types', () => {
    it('recognizes keywords', () => {
      const source = '      INTEGER I\n      REAL X';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const kw = tokens.filter(t => t.type === TokenType.INTEGER || t.type === TokenType.REAL);
      assert.strictEqual(kw.length, 2);
    });

    it('recognizes dot operators', () => {
      const source = '      IF (X .EQ. Y .AND. Z .GT. 0) THEN';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === TokenType.EQ));
      assert.ok(tokens.some(t => t.type === TokenType.AND));
      assert.ok(tokens.some(t => t.type === TokenType.GT));
    });

    it('recognizes string literals', () => {
      const source = "      PRINT *, 'HELLO WORLD'";
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const str = tokens.find(t => t.type === TokenType.STRING_LITERAL);
      assert.ok(str);
      assert.strictEqual(str.value, "'HELLO WORLD'");
    });

    it('recognizes numeric literals', () => {
      const source = '      X = 3.14E2';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      const num = tokens.find(t => t.type === TokenType.REAL_LITERAL);
      assert.ok(num);
      assert.strictEqual(num.value, '3.14E2');
    });

    it('recognizes two-character operators', () => {
      const source = '      Y = X ** 2';
      const lexer = new FortranLexer(source, { fixedForm: true });
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === TokenType.POWER));
    });
  });

  describe('free-form tokenization', () => {
    it('tokenizes free-form code', () => {
      const source = 'program test\n  implicit none\n  integer :: x\n  x = 42\nend program';
      const lexer = new FortranLexer(source, { fixedForm: false });
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === TokenType.PROGRAM));
      assert.ok(tokens.some(t => t.type === TokenType.IMPLICIT));
      assert.ok(tokens.some(t => t.type === TokenType.NONE));
      assert.ok(tokens.some(t => t.type === TokenType.DOUBLE_COLON));
    });

    it('handles & continuation in free-form', () => {
      const source = 'x = 1 + &\n  2 + 3';
      const lexer = new FortranLexer(source, { fixedForm: false });
      const tokens = lexer.tokenize();
      const nums = tokens.filter(t => t.type === TokenType.INTEGER_LITERAL);
      assert.strictEqual(nums.length, 3);
    });
  });
});
