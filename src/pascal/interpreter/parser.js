const { PascalTokenType } = require('../lexer');

/**
 * Recursive-descent parser for Pascal.
 * Produces an AST from the token stream for the interpreter to walk.
 *
 * Grammar subset handled (ISO 7185):
 *   program → PROGRAM id (file-params)? ; block .
 *   block → declarations compound-statement
 *   declarations → (CONST | TYPE | VAR | procedure | function)*
 *   compound-statement → BEGIN statement-list END
 *   statement → assignment | procedure-call | compound | if | for | while | repeat | case | write | read
 */

class ParseError extends Error {
  constructor(message, token) {
    super(message);
    this.token = token;
    this.line = token ? token.line : 0;
    this.column = token ? token.column : 0;
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== PascalTokenType.COMMENT);
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] || { type: PascalTokenType.EOF, value: '', line: 0, column: 0 };
  }

  advance() {
    const t = this.peek();
    this.pos++;
    return t;
  }

  expect(type) {
    const t = this.peek();
    if (t.type !== type) {
      throw new ParseError(`Expected ${type} but got '${t.value}' (${t.type})`, t);
    }
    return this.advance();
  }

  match(...types) {
    if (types.includes(this.peek().type)) {
      return this.advance();
    }
    return null;
  }

  // ---- Program ----

  parseProgram() {
    let name = 'unnamed';
    let fileParams = [];

    if (this.peek().type === PascalTokenType.PROGRAM) {
      this.advance();
      name = this.expect(PascalTokenType.IDENTIFIER).value;
      if (this.match(PascalTokenType.LPAREN)) {
        fileParams = this._parseIdentList();
        this.expect(PascalTokenType.RPAREN);
      }
      this.expect(PascalTokenType.SEMICOLON);
    }

    const block = this.parseBlock();

    this.expect(PascalTokenType.DOT);

    return { type: 'Program', name, fileParams, block };
  }

  // ---- Block ----

  parseBlock() {
    const constants = [];
    const types = [];
    const variables = [];
    const procedures = [];

    // Declaration sections (can appear in any order in Turbo Pascal, but we handle all)
    let parsing = true;
    while (parsing) {
      const t = this.peek();
      switch (t.type) {
        case PascalTokenType.CONST:
          this.advance();
          this._parseConstDeclarations(constants);
          break;
        case PascalTokenType.TYPE:
          this.advance();
          this._parseTypeDeclarations(types);
          break;
        case PascalTokenType.VAR:
          this.advance();
          this._parseVarDeclarations(variables);
          break;
        case PascalTokenType.PROCEDURE:
          procedures.push(this._parseProcedureDecl());
          break;
        case PascalTokenType.FUNCTION:
          procedures.push(this._parseFunctionDecl());
          break;
        case PascalTokenType.LABEL:
          this.advance();
          // Skip label declarations for now
          while (this.peek().type !== PascalTokenType.SEMICOLON && this.peek().type !== PascalTokenType.EOF) {
            this.advance();
          }
          this.match(PascalTokenType.SEMICOLON);
          break;
        case PascalTokenType.USES:
          this.advance();
          while (this.peek().type !== PascalTokenType.SEMICOLON && this.peek().type !== PascalTokenType.EOF) {
            this.advance();
          }
          this.match(PascalTokenType.SEMICOLON);
          break;
        default:
          parsing = false;
      }
    }

    const body = this.parseCompoundStatement();

    return { type: 'Block', constants, types, variables, procedures, body };
  }

  // ---- Declarations ----

  _parseConstDeclarations(list) {
    while (this.peek().type === PascalTokenType.IDENTIFIER) {
      const name = this.advance().value;
      this.expect(PascalTokenType.EQUALS);
      const value = this.parseExpression();
      this.expect(PascalTokenType.SEMICOLON);
      list.push({ type: 'ConstDecl', name, value });
    }
  }

  _parseTypeDeclarations(list) {
    while (this.peek().type === PascalTokenType.IDENTIFIER) {
      const name = this.advance().value;
      this.expect(PascalTokenType.EQUALS);
      const typeDef = this._parseTypeSpec();
      this.expect(PascalTokenType.SEMICOLON);
      list.push({ type: 'TypeDecl', name, typeDef });
    }
  }

  _parseVarDeclarations(list) {
    while (this.peek().type === PascalTokenType.IDENTIFIER) {
      const names = this._parseIdentList();
      this.expect(PascalTokenType.COLON);
      const varType = this._parseTypeSpec();
      this.expect(PascalTokenType.SEMICOLON);
      list.push({ type: 'VarDecl', names, varType });
    }
  }

  _parseTypeSpec() {
    const t = this.peek();

    if (t.type === PascalTokenType.ARRAY) {
      return this._parseArrayType();
    }
    if (t.type === PascalTokenType.RECORD) {
      return this._parseRecordType();
    }
    if (t.type === PascalTokenType.STRING_KW) {
      this.advance();
      let length = 255; // default Turbo Pascal string
      if (this.match(PascalTokenType.LBRACKET)) {
        length = parseInt(this.expect(PascalTokenType.INTEGER_LITERAL).value, 10);
        this.expect(PascalTokenType.RBRACKET);
      }
      return { type: 'StringType', length };
    }
    if (t.type === PascalTokenType.SET) {
      this.advance();
      this.expect(PascalTokenType.OF);
      const elementType = this._parseTypeSpec();
      return { type: 'SetType', elementType };
    }
    if (t.type === PascalTokenType.CARET) {
      this.advance();
      const baseType = this._parseTypeSpec();
      return { type: 'PointerType', baseType };
    }

    // Simple type name or subrange
    if (this._isTypeName(t.type)) {
      const name = this.advance().value;
      return { type: 'SimpleType', name };
    }

    if (t.type === PascalTokenType.IDENTIFIER) {
      const name = this.advance().value;
      // Could be subrange: ident..ident
      if (this.peek().type === PascalTokenType.DOTDOT) {
        this.advance();
        const high = this.parseExpression();
        return { type: 'SubrangeType', low: { type: 'Identifier', name }, high };
      }
      return { type: 'SimpleType', name };
    }

    if (t.type === PascalTokenType.INTEGER_LITERAL || t.type === PascalTokenType.MINUS) {
      const low = this.parseExpression();
      this.expect(PascalTokenType.DOTDOT);
      const high = this.parseExpression();
      return { type: 'SubrangeType', low, high };
    }

    if (t.type === PascalTokenType.LPAREN) {
      // Enumerated type
      this.advance();
      const values = this._parseIdentList();
      this.expect(PascalTokenType.RPAREN);
      return { type: 'EnumType', values };
    }

    throw new ParseError(`Expected type specification, got '${t.value}'`, t);
  }

  _parseArrayType() {
    this.expect(PascalTokenType.ARRAY);
    this.expect(PascalTokenType.LBRACKET);
    const indexTypes = [];
    indexTypes.push(this._parseTypeSpec());
    while (this.match(PascalTokenType.COMMA)) {
      indexTypes.push(this._parseTypeSpec());
    }
    this.expect(PascalTokenType.RBRACKET);
    this.expect(PascalTokenType.OF);
    const elementType = this._parseTypeSpec();
    return { type: 'ArrayType', indexTypes, elementType };
  }

  _parseRecordType() {
    this.expect(PascalTokenType.RECORD);
    const fields = [];
    while (this.peek().type !== PascalTokenType.END && this.peek().type !== PascalTokenType.EOF) {
      if (this.peek().type === PascalTokenType.CASE) {
        // Variant part — skip for simplicity
        while (this.peek().type !== PascalTokenType.END && this.peek().type !== PascalTokenType.EOF) {
          this.advance();
        }
        break;
      }
      if (this.peek().type === PascalTokenType.IDENTIFIER) {
        const names = this._parseIdentList();
        this.expect(PascalTokenType.COLON);
        const fieldType = this._parseTypeSpec();
        fields.push({ names, fieldType });
      }
      this.match(PascalTokenType.SEMICOLON);
    }
    this.expect(PascalTokenType.END);
    return { type: 'RecordType', fields };
  }

  _parseProcedureDecl() {
    this.expect(PascalTokenType.PROCEDURE);
    const name = this.expect(PascalTokenType.IDENTIFIER).value;
    const params = this._parseParamList();
    this.expect(PascalTokenType.SEMICOLON);

    if (this.match(PascalTokenType.FORWARD)) {
      this.expect(PascalTokenType.SEMICOLON);
      return { type: 'ProcedureDecl', name, params, block: null, isForward: true };
    }

    const block = this.parseBlock();
    this.expect(PascalTokenType.SEMICOLON);
    return { type: 'ProcedureDecl', name, params, block };
  }

  _parseFunctionDecl() {
    this.expect(PascalTokenType.FUNCTION);
    const name = this.expect(PascalTokenType.IDENTIFIER).value;
    const params = this._parseParamList();
    this.expect(PascalTokenType.COLON);
    const returnType = this._parseTypeSpec();
    this.expect(PascalTokenType.SEMICOLON);

    if (this.match(PascalTokenType.FORWARD)) {
      this.expect(PascalTokenType.SEMICOLON);
      return { type: 'FunctionDecl', name, params, returnType, block: null, isForward: true };
    }

    const block = this.parseBlock();
    this.expect(PascalTokenType.SEMICOLON);
    return { type: 'FunctionDecl', name, params, returnType, block };
  }

  _parseParamList() {
    const params = [];
    if (!this.match(PascalTokenType.LPAREN)) return params;

    while (this.peek().type !== PascalTokenType.RPAREN && this.peek().type !== PascalTokenType.EOF) {
      const isVar = !!this.match(PascalTokenType.VAR);
      const names = this._parseIdentList();
      this.expect(PascalTokenType.COLON);
      const paramType = this._parseTypeSpec();
      params.push({ names, paramType, isVar });
      this.match(PascalTokenType.SEMICOLON);
    }
    this.expect(PascalTokenType.RPAREN);
    return params;
  }

  _parseIdentList() {
    const names = [];
    names.push(this.expect(PascalTokenType.IDENTIFIER).value);
    while (this.match(PascalTokenType.COMMA)) {
      names.push(this.expect(PascalTokenType.IDENTIFIER).value);
    }
    return names;
  }

  _isTypeName(type) {
    return [
      PascalTokenType.INTEGER_KW, PascalTokenType.REAL_KW,
      PascalTokenType.BOOLEAN_KW, PascalTokenType.CHAR_KW,
      PascalTokenType.BYTE_KW, PascalTokenType.WORD_KW,
      PascalTokenType.LONGINT_KW, PascalTokenType.SHORTINT_KW,
    ].includes(type);
  }

  // ---- Statements ----

  parseCompoundStatement() {
    this.expect(PascalTokenType.BEGIN);
    const statements = this.parseStatementList();
    this.expect(PascalTokenType.END);
    return { type: 'Compound', statements };
  }

  parseStatementList() {
    const stmts = [];
    stmts.push(this.parseStatement());
    while (this.match(PascalTokenType.SEMICOLON)) {
      if (this.peek().type === PascalTokenType.END || this.peek().type === PascalTokenType.UNTIL) break;
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  parseStatement() {
    const t = this.peek();

    if (t.type === PascalTokenType.BEGIN) return this.parseCompoundStatement();
    if (t.type === PascalTokenType.IF) return this._parseIf();
    if (t.type === PascalTokenType.FOR) return this._parseFor();
    if (t.type === PascalTokenType.WHILE) return this._parseWhile();
    if (t.type === PascalTokenType.REPEAT) return this._parseRepeat();
    if (t.type === PascalTokenType.CASE) return this._parseCase();
    if (t.type === PascalTokenType.WRITE || t.type === PascalTokenType.WRITELN) return this._parseWrite();
    if (t.type === PascalTokenType.READ || t.type === PascalTokenType.READLN) return this._parseRead();
    if (t.type === PascalTokenType.EXIT) { this.advance(); return { type: 'Exit', line: t.line }; }
    if (t.type === PascalTokenType.BREAK) { this.advance(); return { type: 'Break', line: t.line }; }
    if (t.type === PascalTokenType.CONTINUE) { this.advance(); return { type: 'Continue', line: t.line }; }

    if (t.type === PascalTokenType.IDENTIFIER) {
      return this._parseAssignmentOrCall();
    }

    // Empty statement
    if (t.type === PascalTokenType.SEMICOLON || t.type === PascalTokenType.END || t.type === PascalTokenType.UNTIL) {
      return { type: 'Empty', line: t.line };
    }

    // Skip unknown
    this.advance();
    return { type: 'Empty', line: t.line };
  }

  _parseAssignmentOrCall() {
    const nameToken = this.advance();
    let target = { type: 'Identifier', name: nameToken.value, line: nameToken.line };

    // Handle array indexing and field access
    while (true) {
      if (this.peek().type === PascalTokenType.LBRACKET) {
        this.advance();
        const indices = [];
        indices.push(this.parseExpression());
        while (this.match(PascalTokenType.COMMA)) {
          indices.push(this.parseExpression());
        }
        this.expect(PascalTokenType.RBRACKET);
        target = { type: 'ArrayAccess', array: target, indices, line: nameToken.line };
      } else if (this.peek().type === PascalTokenType.DOT) {
        this.advance();
        const field = this.expect(PascalTokenType.IDENTIFIER).value;
        target = { type: 'FieldAccess', object: target, field, line: nameToken.line };
      } else if (this.peek().type === PascalTokenType.CARET) {
        this.advance();
        target = { type: 'Dereference', pointer: target, line: nameToken.line };
      } else {
        break;
      }
    }

    // Assignment
    if (this.peek().type === PascalTokenType.ASSIGN) {
      this.advance();
      const value = this.parseExpression();
      return { type: 'Assignment', target, value, line: nameToken.line };
    }

    // Procedure call with arguments
    if (this.peek().type === PascalTokenType.LPAREN) {
      this.advance();
      const args = [];
      if (this.peek().type !== PascalTokenType.RPAREN) {
        args.push(this.parseExpression());
        while (this.match(PascalTokenType.COMMA)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(PascalTokenType.RPAREN);
      return { type: 'ProcedureCall', name: nameToken.value, args, line: nameToken.line };
    }

    // Procedure call without arguments
    return { type: 'ProcedureCall', name: nameToken.value, args: [], line: nameToken.line };
  }

  _parseIf() {
    const line = this.advance().line; // IF
    const condition = this.parseExpression();
    this.expect(PascalTokenType.THEN);
    const thenBranch = this.parseStatement();
    let elseBranch = null;
    if (this.match(PascalTokenType.ELSE)) {
      elseBranch = this.parseStatement();
    }
    return { type: 'If', condition, thenBranch, elseBranch, line };
  }

  _parseFor() {
    const line = this.advance().line; // FOR
    const variable = this.expect(PascalTokenType.IDENTIFIER).value;
    this.expect(PascalTokenType.ASSIGN);
    const start = this.parseExpression();
    const direction = this.match(PascalTokenType.TO) ? 'to' : (this.expect(PascalTokenType.DOWNTO), 'downto');
    const end = this.parseExpression();
    this.expect(PascalTokenType.DO);
    const body = this.parseStatement();
    return { type: 'For', variable, start, end, direction, body, line };
  }

  _parseWhile() {
    const line = this.advance().line; // WHILE
    const condition = this.parseExpression();
    this.expect(PascalTokenType.DO);
    const body = this.parseStatement();
    return { type: 'While', condition, body, line };
  }

  _parseRepeat() {
    const line = this.advance().line; // REPEAT
    const statements = this.parseStatementList();
    this.expect(PascalTokenType.UNTIL);
    const condition = this.parseExpression();
    return { type: 'Repeat', statements, condition, line };
  }

  _parseCase() {
    const line = this.advance().line; // CASE
    const expr = this.parseExpression();
    this.expect(PascalTokenType.OF);

    const branches = [];
    while (this.peek().type !== PascalTokenType.END && this.peek().type !== PascalTokenType.ELSE &&
           this.peek().type !== PascalTokenType.EOF) {
      const values = [];
      values.push(this.parseExpression());
      while (this.match(PascalTokenType.COMMA)) {
        values.push(this.parseExpression());
      }
      this.expect(PascalTokenType.COLON);
      const body = this.parseStatement();
      branches.push({ values, body });
      this.match(PascalTokenType.SEMICOLON);
    }

    let elseBranch = null;
    if (this.match(PascalTokenType.ELSE)) {
      elseBranch = this.parseStatement();
      this.match(PascalTokenType.SEMICOLON);
    }

    this.expect(PascalTokenType.END);
    return { type: 'Case', expr, branches, elseBranch, line };
  }

  _parseWrite() {
    const t = this.advance();
    const isLn = (t.type === PascalTokenType.WRITELN);
    const args = [];

    if (this.match(PascalTokenType.LPAREN)) {
      if (this.peek().type !== PascalTokenType.RPAREN) {
        args.push(this._parseWriteArg());
        while (this.match(PascalTokenType.COMMA)) {
          args.push(this._parseWriteArg());
        }
      }
      this.expect(PascalTokenType.RPAREN);
    }

    return { type: 'Write', args, newline: isLn, line: t.line };
  }

  _parseWriteArg() {
    const expr = this.parseExpression();
    let width = null;
    let decimals = null;

    if (this.match(PascalTokenType.COLON)) {
      width = this.parseExpression();
      if (this.match(PascalTokenType.COLON)) {
        decimals = this.parseExpression();
      }
    }

    return { expr, width, decimals };
  }

  _parseRead() {
    const t = this.advance();
    const isLn = (t.type === PascalTokenType.READLN);
    const args = [];

    if (this.match(PascalTokenType.LPAREN)) {
      if (this.peek().type !== PascalTokenType.RPAREN) {
        args.push(this.parseExpression());
        while (this.match(PascalTokenType.COMMA)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(PascalTokenType.RPAREN);
    }

    return { type: 'Read', args, newline: isLn, line: t.line };
  }

  // ---- Expressions ----

  parseExpression() {
    let left = this._parseSimpleExpr();

    const relOps = [
      PascalTokenType.EQUALS, PascalTokenType.NOT_EQUALS,
      PascalTokenType.LESS, PascalTokenType.GREATER,
      PascalTokenType.LESS_EQ, PascalTokenType.GREATER_EQ,
      PascalTokenType.IN,
    ];

    while (relOps.includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this._parseSimpleExpr();
      left = { type: 'BinaryOp', op, left, right };
    }

    return left;
  }

  _parseSimpleExpr() {
    let sign = null;
    if (this.peek().type === PascalTokenType.PLUS || this.peek().type === PascalTokenType.MINUS) {
      sign = this.advance().value;
    }

    let left = this._parseTerm();

    if (sign === '-') {
      left = { type: 'UnaryOp', op: '-', operand: left };
    }

    const addOps = [PascalTokenType.PLUS, PascalTokenType.MINUS, PascalTokenType.OR, PascalTokenType.XOR];
    while (addOps.includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this._parseTerm();
      left = { type: 'BinaryOp', op, left, right };
    }

    return left;
  }

  _parseTerm() {
    let left = this._parseFactor();

    const mulOps = [PascalTokenType.STAR, PascalTokenType.SLASH, PascalTokenType.DIV, PascalTokenType.MOD, PascalTokenType.AND, PascalTokenType.SHL, PascalTokenType.SHR];
    while (mulOps.includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this._parseFactor();
      left = { type: 'BinaryOp', op, left, right };
    }

    return left;
  }

  _parseFactor() {
    const t = this.peek();

    if (t.type === PascalTokenType.INTEGER_LITERAL) {
      this.advance();
      return { type: 'IntegerLiteral', value: parseInt(t.value, 10) };
    }

    if (t.type === PascalTokenType.HEX_LITERAL) {
      this.advance();
      return { type: 'IntegerLiteral', value: parseInt(t.value.substring(1), 16) };
    }

    if (t.type === PascalTokenType.REAL_LITERAL) {
      this.advance();
      return { type: 'RealLiteral', value: parseFloat(t.value) };
    }

    if (t.type === PascalTokenType.STRING_LITERAL || t.type === PascalTokenType.CHAR_LITERAL) {
      this.advance();
      // Strip quotes and unescape
      const raw = t.value.substring(1, t.value.length - 1).replace(/''/g, "'");
      return { type: 'StringLiteral', value: raw };
    }

    if (t.type === PascalTokenType.TRUE) {
      this.advance();
      return { type: 'BooleanLiteral', value: true };
    }

    if (t.type === PascalTokenType.FALSE) {
      this.advance();
      return { type: 'BooleanLiteral', value: false };
    }

    if (t.type === PascalTokenType.NIL) {
      this.advance();
      return { type: 'NilLiteral' };
    }

    if (t.type === PascalTokenType.NOT) {
      this.advance();
      const operand = this._parseFactor();
      return { type: 'UnaryOp', op: 'not', operand };
    }

    if (t.type === PascalTokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(PascalTokenType.RPAREN);
      return expr;
    }

    if (t.type === PascalTokenType.LBRACKET) {
      // Set constructor
      this.advance();
      const elements = [];
      if (this.peek().type !== PascalTokenType.RBRACKET) {
        elements.push(this.parseExpression());
        while (this.match(PascalTokenType.COMMA)) {
          elements.push(this.parseExpression());
        }
      }
      this.expect(PascalTokenType.RBRACKET);
      return { type: 'SetConstructor', elements };
    }

    if (t.type === PascalTokenType.IDENTIFIER || this._isTypeName(t.type)) {
      const name = this.advance().value;

      // Function call with arguments
      if (this.peek().type === PascalTokenType.LPAREN) {
        this.advance();
        const args = [];
        if (this.peek().type !== PascalTokenType.RPAREN) {
          args.push(this.parseExpression());
          while (this.match(PascalTokenType.COMMA)) {
            args.push(this.parseExpression());
          }
        }
        this.expect(PascalTokenType.RPAREN);
        return { type: 'FunctionCall', name, args };
      }

      // Array access
      let result = { type: 'Identifier', name };
      while (this.peek().type === PascalTokenType.LBRACKET) {
        this.advance();
        const indices = [];
        indices.push(this.parseExpression());
        while (this.match(PascalTokenType.COMMA)) {
          indices.push(this.parseExpression());
        }
        this.expect(PascalTokenType.RBRACKET);
        result = { type: 'ArrayAccess', array: result, indices };
      }

      // Field access
      while (this.peek().type === PascalTokenType.DOT) {
        this.advance();
        const field = this.expect(PascalTokenType.IDENTIFIER).value;
        result = { type: 'FieldAccess', object: result, field };
      }

      return result;
    }

    throw new ParseError(`Unexpected token '${t.value}' (${t.type}) in expression`, t);
  }
}

module.exports = { Parser, ParseError };
