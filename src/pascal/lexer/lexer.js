const { PascalTokenType, PascalToken } = require('./tokens');

/**
 * Pascal Lexer / Tokenizer
 *
 * Handles ISO 7185 Standard Pascal and common Turbo Pascal extensions.
 *
 * Pascal comments:
 *   { ... }     Curly brace comments
 *   (* ... *)   Parenthesis-star comments
 *   // ...      Single-line comments (Delphi/FPC extension)
 *
 * Pascal strings:
 *   'hello'     Single-quoted, '' for escaped quote
 *   #65         Character literal by ordinal
 */

const KEYWORDS = new Map([
  ['PROGRAM', PascalTokenType.PROGRAM],
  ['UNIT', PascalTokenType.UNIT],
  ['USES', PascalTokenType.USES],
  ['BEGIN', PascalTokenType.BEGIN],
  ['END', PascalTokenType.END],
  ['PROCEDURE', PascalTokenType.PROCEDURE],
  ['FUNCTION', PascalTokenType.FUNCTION],
  ['LABEL', PascalTokenType.LABEL],
  ['CONST', PascalTokenType.CONST],
  ['TYPE', PascalTokenType.TYPE],
  ['VAR', PascalTokenType.VAR],
  ['FORWARD', PascalTokenType.FORWARD],
  ['IMPLEMENTATION', PascalTokenType.IMPLEMENTATION],
  ['INTERFACE', PascalTokenType.INTERFACE_KW],
  ['IF', PascalTokenType.IF],
  ['THEN', PascalTokenType.THEN],
  ['ELSE', PascalTokenType.ELSE],
  ['CASE', PascalTokenType.CASE],
  ['OF', PascalTokenType.OF],
  ['FOR', PascalTokenType.FOR],
  ['TO', PascalTokenType.TO],
  ['DOWNTO', PascalTokenType.DOWNTO],
  ['DO', PascalTokenType.DO],
  ['WHILE', PascalTokenType.WHILE],
  ['REPEAT', PascalTokenType.REPEAT],
  ['UNTIL', PascalTokenType.UNTIL],
  ['WITH', PascalTokenType.WITH],
  ['GOTO', PascalTokenType.GOTO],
  ['BREAK', PascalTokenType.BREAK],
  ['CONTINUE', PascalTokenType.CONTINUE],
  ['EXIT', PascalTokenType.EXIT],
  ['INTEGER', PascalTokenType.INTEGER_KW],
  ['REAL', PascalTokenType.REAL_KW],
  ['BOOLEAN', PascalTokenType.BOOLEAN_KW],
  ['CHAR', PascalTokenType.CHAR_KW],
  ['STRING', PascalTokenType.STRING_KW],
  ['BYTE', PascalTokenType.BYTE_KW],
  ['WORD', PascalTokenType.WORD_KW],
  ['LONGINT', PascalTokenType.LONGINT_KW],
  ['SHORTINT', PascalTokenType.SHORTINT_KW],
  ['ARRAY', PascalTokenType.ARRAY],
  ['RECORD', PascalTokenType.RECORD],
  ['SET', PascalTokenType.SET],
  ['FILE', PascalTokenType.FILE_KW],
  ['PACKED', PascalTokenType.PACKED],
  ['NIL', PascalTokenType.NIL],
  ['TRUE', PascalTokenType.TRUE],
  ['FALSE', PascalTokenType.FALSE],
  ['AND', PascalTokenType.AND],
  ['OR', PascalTokenType.OR],
  ['NOT', PascalTokenType.NOT],
  ['XOR', PascalTokenType.XOR],
  ['DIV', PascalTokenType.DIV],
  ['MOD', PascalTokenType.MOD],
  ['SHL', PascalTokenType.SHL],
  ['SHR', PascalTokenType.SHR],
  ['IN', PascalTokenType.IN],
  ['WRITE', PascalTokenType.WRITE],
  ['WRITELN', PascalTokenType.WRITELN],
  ['READ', PascalTokenType.READ],
  ['READLN', PascalTokenType.READLN],
]);

class PascalLexer {
  constructor(source, options = {}) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.diagnostics = [];
    this.turboExtensions = options.turboExtensions ?? true;
  }

  tokenize() {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.source.length) {
      this._skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];
      const startLine = this.line;
      const startCol = this.column;

      // Comments: { ... }
      if (ch === '{') {
        this._readCurlyComment(startLine, startCol);
        continue;
      }

      // Comments: (* ... *) or just (
      if (ch === '(' && this._peek(1) === '*') {
        this._readParenStarComment(startLine, startCol);
        continue;
      }

      // Comments: // (Delphi/FPC extension)
      if (ch === '/' && this._peek(1) === '/') {
        this._readLineComment(startLine, startCol);
        continue;
      }

      // Compiler directives: {$...}
      // Already handled by curly comment above — they'll appear as comments

      // String literals
      if (ch === '\'') {
        this._readString(startLine, startCol);
        continue;
      }

      // Character literals: #nn
      if (ch === '#') {
        this._readCharLiteral(startLine, startCol);
        continue;
      }

      // Hex literals: $FF
      if (ch === '$') {
        this._readHexLiteral(startLine, startCol);
        continue;
      }

      // Numbers
      if (this._isDigit(ch)) {
        this._readNumber(startLine, startCol);
        continue;
      }

      // Identifiers and keywords
      if (this._isLetter(ch) || ch === '_') {
        this._readIdentifier(startLine, startCol);
        continue;
      }

      // Multi-character operators
      if (ch === ':' && this._peek(1) === '=') {
        this.tokens.push(new PascalToken(PascalTokenType.ASSIGN, ':=', startLine, startCol));
        this._advance(2);
        continue;
      }
      if (ch === '<' && this._peek(1) === '>') {
        this.tokens.push(new PascalToken(PascalTokenType.NOT_EQUALS, '<>', startLine, startCol));
        this._advance(2);
        continue;
      }
      if (ch === '<' && this._peek(1) === '=') {
        this.tokens.push(new PascalToken(PascalTokenType.LESS_EQ, '<=', startLine, startCol));
        this._advance(2);
        continue;
      }
      if (ch === '>' && this._peek(1) === '=') {
        this.tokens.push(new PascalToken(PascalTokenType.GREATER_EQ, '>=', startLine, startCol));
        this._advance(2);
        continue;
      }
      if (ch === '.' && this._peek(1) === '.') {
        this.tokens.push(new PascalToken(PascalTokenType.DOTDOT, '..', startLine, startCol));
        this._advance(2);
        continue;
      }

      // Single-character operators and delimiters
      const singles = {
        '+': PascalTokenType.PLUS,
        '-': PascalTokenType.MINUS,
        '*': PascalTokenType.STAR,
        '/': PascalTokenType.SLASH,
        '=': PascalTokenType.EQUALS,
        '<': PascalTokenType.LESS,
        '>': PascalTokenType.GREATER,
        '(': PascalTokenType.LPAREN,
        ')': PascalTokenType.RPAREN,
        '[': PascalTokenType.LBRACKET,
        ']': PascalTokenType.RBRACKET,
        ',': PascalTokenType.COMMA,
        ';': PascalTokenType.SEMICOLON,
        ':': PascalTokenType.COLON,
        '.': PascalTokenType.DOT,
        '^': PascalTokenType.CARET,
        '@': PascalTokenType.AT,
      };

      if (singles[ch]) {
        this.tokens.push(new PascalToken(singles[ch], ch, startLine, startCol));
        this._advance(1);
        continue;
      }

      // Unknown character
      this.tokens.push(new PascalToken(PascalTokenType.UNKNOWN, ch, startLine, startCol));
      this.diagnostics.push({
        line: startLine,
        column: startCol,
        severity: 'error',
        message: `Unexpected character: '${ch}'`,
      });
      this._advance(1);
    }

    this.tokens.push(new PascalToken(PascalTokenType.EOF, '', this.line, this.column));
    return this.tokens;
  }

  _peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : null;
  }

  _advance(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.pos < this.source.length) {
        if (this.source[this.pos] === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        this.pos++;
      }
    }
  }

  _skipWhitespace() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this._advance(1);
      } else if (ch === '\n') {
        this._advance(1);
      } else {
        break;
      }
    }
  }

  _readCurlyComment(startLine, startCol) {
    let value = '{';
    this._advance(1); // skip {
    while (this.pos < this.source.length && this.source[this.pos] !== '}') {
      value += this.source[this.pos];
      this._advance(1);
    }
    if (this.pos < this.source.length) {
      value += '}';
      this._advance(1); // skip }
    } else {
      this.diagnostics.push({
        line: startLine, column: startCol, severity: 'error',
        message: 'Unterminated comment (missing closing })',
      });
    }
    this.tokens.push(new PascalToken(PascalTokenType.COMMENT, value, startLine, startCol));
  }

  _readParenStarComment(startLine, startCol) {
    let value = '(*';
    this._advance(2); // skip (*
    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '*' && this._peek(1) === ')') {
        value += '*)';
        this._advance(2);
        this.tokens.push(new PascalToken(PascalTokenType.COMMENT, value, startLine, startCol));
        return;
      }
      value += this.source[this.pos];
      this._advance(1);
    }
    this.diagnostics.push({
      line: startLine, column: startCol, severity: 'error',
      message: 'Unterminated comment (missing closing *) )',
    });
    this.tokens.push(new PascalToken(PascalTokenType.COMMENT, value, startLine, startCol));
  }

  _readLineComment(startLine, startCol) {
    let value = '//';
    this._advance(2); // skip //
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      value += this.source[this.pos];
      this._advance(1);
    }
    this.tokens.push(new PascalToken(PascalTokenType.COMMENT, value, startLine, startCol));
  }

  _readString(startLine, startCol) {
    let value = '\'';
    this._advance(1); // skip opening quote
    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '\'') {
        value += '\'';
        this._advance(1);
        // Doubled quote = escaped
        if (this.pos < this.source.length && this.source[this.pos] === '\'') {
          value += '\'';
          this._advance(1);
          continue;
        }
        // Single char strings get CHAR_LITERAL if length is exactly 3 ('x')
        const inner = value.substring(1, value.length - 1);
        const type = inner.length === 1
          ? PascalTokenType.CHAR_LITERAL
          : PascalTokenType.STRING_LITERAL;
        this.tokens.push(new PascalToken(type, value, startLine, startCol));
        return;
      }
      if (this.source[this.pos] === '\n') {
        this.diagnostics.push({
          line: startLine, column: startCol, severity: 'error',
          message: 'Unterminated string literal (newline before closing quote)',
        });
        this.tokens.push(new PascalToken(PascalTokenType.STRING_LITERAL, value, startLine, startCol));
        return;
      }
      value += this.source[this.pos];
      this._advance(1);
    }
    this.diagnostics.push({
      line: startLine, column: startCol, severity: 'error',
      message: 'Unterminated string literal',
    });
    this.tokens.push(new PascalToken(PascalTokenType.STRING_LITERAL, value, startLine, startCol));
  }

  _readCharLiteral(startLine, startCol) {
    let value = '#';
    this._advance(1); // skip #
    while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance(1);
    }
    if (value.length === 1) {
      this.diagnostics.push({
        line: startLine, column: startCol, severity: 'error',
        message: 'Invalid character literal: # must be followed by a number',
      });
    }
    this.tokens.push(new PascalToken(PascalTokenType.CHAR_LITERAL, value, startLine, startCol));
  }

  _readHexLiteral(startLine, startCol) {
    let value = '$';
    this._advance(1); // skip $
    while (this.pos < this.source.length && this._isHexDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance(1);
    }
    if (value.length === 1) {
      this.diagnostics.push({
        line: startLine, column: startCol, severity: 'error',
        message: 'Invalid hex literal: $ must be followed by hex digits',
      });
    }
    this.tokens.push(new PascalToken(PascalTokenType.HEX_LITERAL, value, startLine, startCol));
  }

  _readNumber(startLine, startCol) {
    let value = '';
    let isReal = false;

    while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this._advance(1);
    }

    // Decimal point (but not ..)
    if (this.pos < this.source.length && this.source[this.pos] === '.' && this._peek(1) !== '.') {
      isReal = true;
      value += '.';
      this._advance(1);
      while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this._advance(1);
      }
    }

    // Exponent
    if (this.pos < this.source.length && (this.source[this.pos] === 'E' || this.source[this.pos] === 'e')) {
      isReal = true;
      value += this.source[this.pos];
      this._advance(1);
      if (this.pos < this.source.length && (this.source[this.pos] === '+' || this.source[this.pos] === '-')) {
        value += this.source[this.pos];
        this._advance(1);
      }
      while (this.pos < this.source.length && this._isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this._advance(1);
      }
    }

    const type = isReal ? PascalTokenType.REAL_LITERAL : PascalTokenType.INTEGER_LITERAL;
    this.tokens.push(new PascalToken(type, value, startLine, startCol));
  }

  _readIdentifier(startLine, startCol) {
    let value = '';
    while (this.pos < this.source.length &&
           (this._isLetter(this.source[this.pos]) || this._isDigit(this.source[this.pos]) || this.source[this.pos] === '_')) {
      value += this.source[this.pos];
      this._advance(1);
    }

    const upper = value.toUpperCase();
    const keywordType = KEYWORDS.get(upper);
    const type = keywordType || PascalTokenType.IDENTIFIER;
    this.tokens.push(new PascalToken(type, value, startLine, startCol));
  }

  _isDigit(ch) { return ch >= '0' && ch <= '9'; }
  _isLetter(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'); }
  _isHexDigit(ch) { return this._isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
}

module.exports = { PascalLexer };
