const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PascalLexer, PascalTokenType } = require('../src/pascal/lexer');

describe('PascalLexer', () => {
  describe('basic tokenization', () => {
    it('tokenizes a simple program', () => {
      const source = 'program Hello;\nbegin\n  writeln(\'Hi\');\nend.';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const types = tokens.map(t => t.type).filter(t => t !== PascalTokenType.EOF);
      assert.ok(types.includes(PascalTokenType.PROGRAM));
      assert.ok(types.includes(PascalTokenType.BEGIN));
      assert.ok(types.includes(PascalTokenType.WRITELN));
      assert.ok(types.includes(PascalTokenType.END));
      assert.ok(types.includes(PascalTokenType.DOT));
    });

    it('recognizes keywords case-insensitively', () => {
      const source = 'Program test; Begin End.';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.PROGRAM));
      assert.ok(tokens.some(t => t.type === PascalTokenType.BEGIN));
      assert.ok(tokens.some(t => t.type === PascalTokenType.END));
    });
  });

  describe('comments', () => {
    it('handles curly brace comments', () => {
      const source = '{ this is a comment } program test;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const comments = tokens.filter(t => t.type === PascalTokenType.COMMENT);
      assert.strictEqual(comments.length, 1);
      assert.ok(comments[0].value.includes('this is a comment'));
    });

    it('handles (* *) comments', () => {
      const source = '(* multi-line\ncomment *) begin end.';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.COMMENT));
    });

    it('handles // line comments', () => {
      const source = 'begin // inline comment\nend.';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.COMMENT));
    });
  });

  describe('literals', () => {
    it('recognizes string literals', () => {
      const source = "writeln('hello world');";
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const str = tokens.find(t => t.type === PascalTokenType.STRING_LITERAL);
      assert.ok(str);
      assert.strictEqual(str.value, "'hello world'");
    });

    it('recognizes integer literals', () => {
      const source = 'x := 42;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const num = tokens.find(t => t.type === PascalTokenType.INTEGER_LITERAL);
      assert.ok(num);
      assert.strictEqual(num.value, '42');
    });

    it('recognizes real literals', () => {
      const source = 'x := 3.14;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const num = tokens.find(t => t.type === PascalTokenType.REAL_LITERAL);
      assert.ok(num);
      assert.strictEqual(num.value, '3.14');
    });

    it('recognizes hex literals', () => {
      const source = 'x := $FF;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const hex = tokens.find(t => t.type === PascalTokenType.HEX_LITERAL);
      assert.ok(hex);
      assert.strictEqual(hex.value, '$FF');
    });

    it('recognizes char literals with #', () => {
      const source = 'c := #65;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const ch = tokens.find(t => t.type === PascalTokenType.CHAR_LITERAL);
      assert.ok(ch);
    });
  });

  describe('operators', () => {
    it('recognizes := assignment', () => {
      const source = 'x := 1;';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.ASSIGN));
    });

    it('recognizes comparison operators', () => {
      const source = 'if x <> y then if a <= b then if c >= d then';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.NOT_EQUALS));
      assert.ok(tokens.some(t => t.type === PascalTokenType.LESS_EQ));
      assert.ok(tokens.some(t => t.type === PascalTokenType.GREATER_EQ));
    });

    it('recognizes .. range operator', () => {
      const source = 'array[1..10] of integer';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.DOTDOT));
    });

    it('recognizes logical operators as keywords', () => {
      const source = 'if a and b or not c then';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      assert.ok(tokens.some(t => t.type === PascalTokenType.AND));
      assert.ok(tokens.some(t => t.type === PascalTokenType.OR));
      assert.ok(tokens.some(t => t.type === PascalTokenType.NOT));
    });
  });

  describe('line tracking', () => {
    it('tracks line numbers correctly', () => {
      const source = 'program test;\nvar x: integer;\nbegin\nend.';
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();
      const program = tokens.find(t => t.type === PascalTokenType.PROGRAM);
      const begin = tokens.find(t => t.type === PascalTokenType.BEGIN);
      assert.strictEqual(program.line, 1);
      assert.strictEqual(begin.line, 3);
    });
  });
});
