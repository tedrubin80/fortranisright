/**
 * Token types for Pascal lexical analysis.
 * Based on ISO 7185 (Standard Pascal) and Turbo Pascal extensions.
 */

const PascalTokenType = Object.freeze({
  // Structural
  COMMENT: 'COMMENT',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
  WHITESPACE: 'WHITESPACE',

  // Keywords — program structure
  PROGRAM: 'PROGRAM',
  UNIT: 'UNIT',
  USES: 'USES',
  BEGIN: 'BEGIN',
  END: 'END',
  PROCEDURE: 'PROCEDURE',
  FUNCTION: 'FUNCTION',
  LABEL: 'LABEL',
  CONST: 'CONST',
  TYPE: 'TYPE',
  VAR: 'VAR',
  FORWARD: 'FORWARD',
  IMPLEMENTATION: 'IMPLEMENTATION',
  INTERFACE_KW: 'INTERFACE_KW',

  // Control flow
  IF: 'IF',
  THEN: 'THEN',
  ELSE: 'ELSE',
  CASE: 'CASE',
  OF: 'OF',
  FOR: 'FOR',
  TO: 'TO',
  DOWNTO: 'DOWNTO',
  DO: 'DO',
  WHILE: 'WHILE',
  REPEAT: 'REPEAT',
  UNTIL: 'UNTIL',
  WITH: 'WITH',
  GOTO: 'GOTO',
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',
  EXIT: 'EXIT',

  // Type keywords
  INTEGER_KW: 'INTEGER_KW',
  REAL_KW: 'REAL_KW',
  BOOLEAN_KW: 'BOOLEAN_KW',
  CHAR_KW: 'CHAR_KW',
  STRING_KW: 'STRING_KW',
  BYTE_KW: 'BYTE_KW',
  WORD_KW: 'WORD_KW',
  LONGINT_KW: 'LONGINT_KW',
  SHORTINT_KW: 'SHORTINT_KW',

  // Structured types
  ARRAY: 'ARRAY',
  RECORD: 'RECORD',
  SET: 'SET',
  FILE_KW: 'FILE_KW',
  PACKED: 'PACKED',
  NIL: 'NIL',

  // Boolean literals
  TRUE: 'TRUE',
  FALSE: 'FALSE',

  // Operators
  PLUS: 'PLUS',           // +
  MINUS: 'MINUS',         // -
  STAR: 'STAR',           // *
  SLASH: 'SLASH',         // /
  ASSIGN: 'ASSIGN',       // :=
  EQUALS: 'EQUALS',       // =
  NOT_EQUALS: 'NOT_EQUALS', // <>
  LESS: 'LESS',           // <
  GREATER: 'GREATER',     // >
  LESS_EQ: 'LESS_EQ',     // <=
  GREATER_EQ: 'GREATER_EQ', // >=

  // Logical / set operators
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  XOR: 'XOR',
  DIV: 'DIV',
  MOD: 'MOD',
  SHL: 'SHL',
  SHR: 'SHR',
  IN: 'IN',

  // Delimiters
  LPAREN: 'LPAREN',       // (
  RPAREN: 'RPAREN',       // )
  LBRACKET: 'LBRACKET',   // [
  RBRACKET: 'RBRACKET',   // ]
  COMMA: 'COMMA',         // ,
  SEMICOLON: 'SEMICOLON', // ;
  COLON: 'COLON',         // :
  DOT: 'DOT',             // .
  DOTDOT: 'DOTDOT',       // ..
  CARET: 'CARET',         // ^
  AT: 'AT',               // @

  // I/O
  WRITE: 'WRITE',
  WRITELN: 'WRITELN',
  READ: 'READ',
  READLN: 'READLN',

  // Literals
  INTEGER_LITERAL: 'INTEGER_LITERAL',
  REAL_LITERAL: 'REAL_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',
  CHAR_LITERAL: 'CHAR_LITERAL',
  HEX_LITERAL: 'HEX_LITERAL',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Unknown
  UNKNOWN: 'UNKNOWN',
});

class PascalToken {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

module.exports = { PascalTokenType, PascalToken };
