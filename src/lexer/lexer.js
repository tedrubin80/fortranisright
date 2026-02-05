const { TokenType, Token } = require('./tokens');

/**
 * Fortran Lexer / Tokenizer
 *
 * Handles both fixed-form (FORTRAN 77 style, columns 1-72) and
 * free-form (Fortran 90+ style) source code.
 *
 * Fixed-form layout (per ANSI X3.9-1978):
 *   Col 1:     Comment indicator (C, c, *, !)
 *   Col 1-5:   Statement label (numeric)
 *   Col 6:     Continuation character (any non-blank, non-zero)
 *   Col 7-72:  Statement body
 *   Col 73+:   Ignored (historically for sequence numbers)
 */

const KEYWORDS = new Map([
  ['PROGRAM', TokenType.PROGRAM],
  ['SUBROUTINE', TokenType.SUBROUTINE],
  ['FUNCTION', TokenType.FUNCTION],
  ['END', TokenType.END],
  ['RETURN', TokenType.RETURN],
  ['CALL', TokenType.CALL],
  ['STOP', TokenType.STOP],
  ['PAUSE', TokenType.PAUSE],
  ['ENTRY', TokenType.ENTRY],
  ['BLOCKDATA', TokenType.BLOCK_DATA],
  ['MODULE', TokenType.MODULE],
  ['CONTAINS', TokenType.CONTAINS],
  ['USE', TokenType.USE],
  ['INTERFACE', TokenType.INTERFACE],
  ['IF', TokenType.IF],
  ['THEN', TokenType.THEN],
  ['ELSE', TokenType.ELSE],
  ['ELSEIF', TokenType.ELSEIF],
  ['ENDIF', TokenType.ENDIF],
  ['DO', TokenType.DO],
  ['ENDDO', TokenType.ENDDO],
  ['DOWHILE', TokenType.DOWHILE],
  ['CONTINUE', TokenType.CONTINUE],
  ['GOTO', TokenType.GOTO],
  ['SELECT', TokenType.SELECT],
  ['CASE', TokenType.CASE],
  ['WHERE', TokenType.WHERE],
  ['FORALL', TokenType.FORALL],
  ['CYCLE', TokenType.CYCLE],
  ['EXIT', TokenType.EXIT],
  ['READ', TokenType.READ],
  ['WRITE', TokenType.WRITE],
  ['PRINT', TokenType.PRINT],
  ['OPEN', TokenType.OPEN],
  ['CLOSE', TokenType.CLOSE],
  ['REWIND', TokenType.REWIND],
  ['BACKSPACE', TokenType.BACKSPACE],
  ['ENDFILE', TokenType.ENDFILE],
  ['INQUIRE', TokenType.INQUIRE],
  ['FORMAT', TokenType.FORMAT],
  ['INTEGER', TokenType.INTEGER],
  ['REAL', TokenType.REAL],
  ['DOUBLEPRECISION', TokenType.DOUBLE_PRECISION],
  ['COMPLEX', TokenType.COMPLEX],
  ['LOGICAL', TokenType.LOGICAL],
  ['CHARACTER', TokenType.CHARACTER],
  ['DIMENSION', TokenType.DIMENSION],
  ['COMMON', TokenType.COMMON],
  ['EQUIVALENCE', TokenType.EQUIVALENCE],
  ['DATA', TokenType.DATA],
  ['PARAMETER', TokenType.PARAMETER],
  ['IMPLICIT', TokenType.IMPLICIT],
  ['NONE', TokenType.NONE],
  ['SAVE', TokenType.SAVE],
  ['EXTERNAL', TokenType.EXTERNAL],
  ['INTRINSIC', TokenType.INTRINSIC],
  ['INTENT', TokenType.INTENT],
  ['OPTIONAL', TokenType.OPTIONAL],
  ['ALLOCATABLE', TokenType.ALLOCATABLE],
  ['POINTER', TokenType.POINTER],
  ['TARGET', TokenType.TARGET],
  ['TYPE', TokenType.TYPE],
  ['ASSIGN', TokenType.ASSIGN],
]);

const DOT_OPERATORS = new Map([
  ['.EQ.', TokenType.EQ],
  ['.NE.', TokenType.NE],
  ['.LT.', TokenType.LT],
  ['.GT.', TokenType.GT],
  ['.LE.', TokenType.LE],
  ['.GE.', TokenType.GE],
  ['.AND.', TokenType.AND],
  ['.OR.', TokenType.OR],
  ['.NOT.', TokenType.NOT],
  ['.EQV.', TokenType.EQV],
  ['.NEQV.', TokenType.NEQV],
  ['.TRUE.', TokenType.TRUE],
  ['.FALSE.', TokenType.FALSE],
]);

class FortranLexer {
  constructor(source, options = {}) {
    this.source = source;
    this.lines = source.split(/\r?\n/);
    this.fixedForm = options.fixedForm ?? this._detectForm();
    this.tokens = [];
    this.currentLine = 0;
    this.currentCol = 0;
    this.diagnostics = [];
  }

  /**
   * Detect whether source is fixed-form or free-form.
   * Heuristic: if any non-comment line has content in cols 1-6 that looks
   * like a label field, or if file extension hints at it, assume fixed-form.
   */
  _detectForm() {
    for (const line of this.lines) {
      if (line.length === 0) continue;
      const firstChar = line[0];
      // Comment indicators strongly suggest fixed-form
      if (firstChar === 'C' || firstChar === 'c' || firstChar === '*') {
        return true;
      }
      // If we see a & continuation at end of line, it's free-form
      const trimmed = line.trimEnd();
      if (trimmed.length > 0 && trimmed[trimmed.length - 1] === '&') {
        return false;
      }
    }
    // Default to fixed-form for legacy compatibility
    return true;
  }

  tokenize() {
    this.tokens = [];
    this.currentLine = 0;

    if (this.fixedForm) {
      this._tokenizeFixedForm();
    } else {
      this._tokenizeFreeForm();
    }

    this.tokens.push(new Token(TokenType.EOF, '', this.lines.length + 1, 0));
    return this.tokens;
  }

  _tokenizeFixedForm() {
    // First pass: assemble logical lines (handling continuations)
    const logicalLines = this._assembleFixedFormLines();

    for (const logLine of logicalLines) {
      this.currentLine = logLine.startLine;
      this._tokenizeLine(logLine.text, logLine.startLine, logLine.label, logLine.isComment);
    }
  }

  _assembleFixedFormLines() {
    const logicalLines = [];
    let i = 0;

    while (i < this.lines.length) {
      const raw = this.lines[i];
      const lineNum = i + 1;

      // Empty line
      if (raw.trim().length === 0) {
        logicalLines.push({ startLine: lineNum, text: '', label: null, isComment: false });
        i++;
        continue;
      }

      // Comment line: col 1 is C, c, *, or !
      const firstChar = raw[0];
      if (firstChar === 'C' || firstChar === 'c' || firstChar === '*' || firstChar === '!') {
        logicalLines.push({ startLine: lineNum, text: raw, label: null, isComment: true });
        i++;
        continue;
      }

      // Extract label (cols 1-5)
      const labelField = raw.substring(0, Math.min(5, raw.length)).trimEnd();
      const label = labelField.length > 0 ? labelField : null;

      // Statement body starts at col 7 (index 6)
      let body = raw.length > 6 ? raw.substring(6, Math.min(72, raw.length)) : '';

      // Check for continuation lines
      i++;
      while (i < this.lines.length) {
        const nextRaw = this.lines[i];
        if (nextRaw.length < 6) break;
        const nextFirst = nextRaw[0];
        if (nextFirst === 'C' || nextFirst === 'c' || nextFirst === '*' || nextFirst === '!') break;
        // Col 6 non-blank non-zero = continuation
        const col6 = nextRaw[5];
        if (col6 !== ' ' && col6 !== '0' && col6 !== undefined) {
          const contBody = nextRaw.length > 6 ? nextRaw.substring(6, Math.min(72, nextRaw.length)) : '';
          body += contBody;
          i++;
        } else {
          break;
        }
      }

      logicalLines.push({ startLine: lineNum, text: body, label, isComment: false });
    }

    return logicalLines;
  }

  _tokenizeFreeForm() {
    // Assemble logical lines with & continuation
    const logicalLines = this._assembleFreeFormLines();

    for (const logLine of logicalLines) {
      this.currentLine = logLine.startLine;
      this._tokenizeLine(logLine.text, logLine.startLine, null, logLine.isComment);
    }
  }

  _assembleFreeFormLines() {
    const logicalLines = [];
    let i = 0;

    while (i < this.lines.length) {
      const raw = this.lines[i];
      const lineNum = i + 1;
      const trimmed = raw.trim();

      if (trimmed.length === 0) {
        logicalLines.push({ startLine: lineNum, text: '', isComment: false });
        i++;
        continue;
      }

      // Comment: first non-blank character is !
      if (trimmed[0] === '!') {
        logicalLines.push({ startLine: lineNum, text: raw, isComment: true });
        i++;
        continue;
      }

      // Check for & continuation
      let body = raw;
      if (trimmed.endsWith('&')) {
        body = raw.replace(/&\s*$/, '');
        i++;
        while (i < this.lines.length) {
          const nextTrimmed = this.lines[i].trim();
          // Skip the leading & on continuation line if present
          const contText = nextTrimmed.startsWith('&') ? nextTrimmed.substring(1) : this.lines[i];
          if (nextTrimmed.endsWith('&')) {
            body += contText.replace(/&\s*$/, '');
            i++;
          } else {
            body += contText;
            i++;
            break;
          }
        }
      } else {
        i++;
      }

      logicalLines.push({ startLine: lineNum, text: body, isComment: false });
    }

    return logicalLines;
  }

  _tokenizeLine(text, lineNum, label, isComment) {
    if (isComment) {
      this.tokens.push(new Token(TokenType.COMMENT, text, lineNum, 1));
      return;
    }

    if (label) {
      this.tokens.push(new Token(TokenType.LABEL, label.trim(), lineNum, 1));
    }

    if (text.trim().length === 0) {
      this.tokens.push(new Token(TokenType.NEWLINE, '\n', lineNum, 1));
      return;
    }

    let pos = 0;
    const len = text.length;

    while (pos < len) {
      // Skip whitespace
      if (text[pos] === ' ' || text[pos] === '\t') {
        pos++;
        continue;
      }

      const col = pos + 1;

      // Inline comment (!)
      if (text[pos] === '!') {
        this.tokens.push(new Token(TokenType.COMMENT, text.substring(pos), lineNum, col));
        break;
      }

      // String literal (single or double quoted)
      if (text[pos] === '\'' || text[pos] === '"') {
        const result = this._readString(text, pos, lineNum, col);
        this.tokens.push(result.token);
        pos = result.pos;
        continue;
      }

      // Dot operators (.EQ., .AND., .TRUE., etc.)
      if (text[pos] === '.') {
        const dotResult = this._readDotOperator(text, pos, lineNum, col);
        if (dotResult) {
          this.tokens.push(dotResult.token);
          pos = dotResult.pos;
          continue;
        }
        // Could be a decimal point in a number — fall through
      }

      // Numbers (integer and real literals)
      if (this._isDigit(text[pos]) || (text[pos] === '.' && pos + 1 < len && this._isDigit(text[pos + 1]))) {
        const result = this._readNumber(text, pos, lineNum, col);
        this.tokens.push(result.token);
        pos = result.pos;
        continue;
      }

      // Identifiers and keywords
      if (this._isLetter(text[pos]) || text[pos] === '_') {
        const result = this._readIdentifier(text, pos, lineNum, col);
        this.tokens.push(result.token);
        pos = result.pos;
        continue;
      }

      // Operators and delimiters
      const opResult = this._readOperator(text, pos, lineNum, col);
      if (opResult) {
        this.tokens.push(opResult.token);
        pos = opResult.pos;
        continue;
      }

      // Unknown character
      this.tokens.push(new Token(TokenType.UNKNOWN, text[pos], lineNum, col));
      this.diagnostics.push({
        line: lineNum,
        column: col,
        severity: 'error',
        message: `Unexpected character: '${text[pos]}'`,
      });
      pos++;
    }

    this.tokens.push(new Token(TokenType.NEWLINE, '\n', lineNum, text.length + 1));
  }

  _readString(text, pos, line, col) {
    const quote = text[pos];
    let value = quote;
    pos++;
    while (pos < text.length) {
      if (text[pos] === quote) {
        value += text[pos];
        pos++;
        // Doubled quote is an escape
        if (pos < text.length && text[pos] === quote) {
          value += text[pos];
          pos++;
          continue;
        }
        return { token: new Token(TokenType.STRING_LITERAL, value, line, col), pos };
      }
      value += text[pos];
      pos++;
    }
    // Unterminated string
    this.diagnostics.push({
      line, column: col, severity: 'error',
      message: 'Unterminated string literal',
    });
    return { token: new Token(TokenType.STRING_LITERAL, value, line, col), pos };
  }

  _readDotOperator(text, pos, line, col) {
    const remaining = text.substring(pos).toUpperCase();
    for (const [op, type] of DOT_OPERATORS) {
      if (remaining.startsWith(op)) {
        return {
          token: new Token(type, text.substring(pos, pos + op.length), line, col),
          pos: pos + op.length,
        };
      }
    }
    return null;
  }

  _readNumber(text, pos, line, col) {
    let value = '';
    let isReal = false;

    // Integer part
    while (pos < text.length && this._isDigit(text[pos])) {
      value += text[pos];
      pos++;
    }

    // Decimal point
    if (pos < text.length && text[pos] === '.') {
      // Check it's not a dot-operator like .EQ.
      const ahead = text.substring(pos).toUpperCase();
      const isDotOp = Array.from(DOT_OPERATORS.keys()).some(op => ahead.startsWith(op));
      if (!isDotOp) {
        isReal = true;
        value += text[pos];
        pos++;
        while (pos < text.length && this._isDigit(text[pos])) {
          value += text[pos];
          pos++;
        }
      }
    }

    // Exponent (E, D, e, d)
    if (pos < text.length && (text[pos] === 'E' || text[pos] === 'e' || text[pos] === 'D' || text[pos] === 'd')) {
      isReal = true;
      value += text[pos];
      pos++;
      if (pos < text.length && (text[pos] === '+' || text[pos] === '-')) {
        value += text[pos];
        pos++;
      }
      while (pos < text.length && this._isDigit(text[pos])) {
        value += text[pos];
        pos++;
      }
    }

    const type = isReal ? TokenType.REAL_LITERAL : TokenType.INTEGER_LITERAL;
    return { token: new Token(type, value, line, col), pos };
  }

  _readIdentifier(text, pos, line, col) {
    let value = '';
    while (pos < text.length && (this._isLetter(text[pos]) || this._isDigit(text[pos]) || text[pos] === '_')) {
      value += text[pos];
      pos++;
    }

    const upper = value.toUpperCase();
    const keywordType = KEYWORDS.get(upper);
    const type = keywordType || TokenType.IDENTIFIER;

    return { token: new Token(type, value, line, col), pos };
  }

  _readOperator(text, pos, line, col) {
    const ch = text[pos];
    const next = pos + 1 < text.length ? text[pos + 1] : '';

    // Two-character operators
    if (ch === '*' && next === '*') return { token: new Token(TokenType.POWER, '**', line, col), pos: pos + 2 };
    if (ch === '/' && next === '/') return { token: new Token(TokenType.CONCAT, '//', line, col), pos: pos + 2 };
    if (ch === '/' && next === '=') return { token: new Token(TokenType.NE, '/=', line, col), pos: pos + 2 };
    if (ch === '=' && next === '=') return { token: new Token(TokenType.EQ, '==', line, col), pos: pos + 2 };
    if (ch === '<' && next === '=') return { token: new Token(TokenType.LE, '<=', line, col), pos: pos + 2 };
    if (ch === '>' && next === '=') return { token: new Token(TokenType.GE, '>=', line, col), pos: pos + 2 };
    if (ch === ':' && next === ':') return { token: new Token(TokenType.DOUBLE_COLON, '::', line, col), pos: pos + 2 };

    // Single-character operators
    const singles = {
      '=': TokenType.ASSIGN,
      '+': TokenType.PLUS,
      '-': TokenType.MINUS,
      '*': TokenType.STAR,
      '/': TokenType.SLASH,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      ',': TokenType.COMMA,
      ':': TokenType.COLON,
      '<': TokenType.LT,
      '>': TokenType.GT,
      '%': TokenType.PERCENT,
    };

    if (singles[ch]) {
      return { token: new Token(singles[ch], ch, line, col), pos: pos + 1 };
    }

    return null;
  }

  _isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  _isLetter(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }
}

module.exports = { FortranLexer };
