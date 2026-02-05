/**
 * Token types for Fortran lexical analysis.
 * Based on FORTRAN 77 (MIL-STD-1753) and Fortran 90/95 standards.
 */

const TokenType = Object.freeze({
  // Structural
  LABEL: 'LABEL',
  CONTINUATION: 'CONTINUATION',
  COMMENT: 'COMMENT',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
  WHITESPACE: 'WHITESPACE',

  // Keywords — statements
  PROGRAM: 'PROGRAM',
  SUBROUTINE: 'SUBROUTINE',
  FUNCTION: 'FUNCTION',
  END: 'END',
  RETURN: 'RETURN',
  CALL: 'CALL',
  STOP: 'STOP',
  PAUSE: 'PAUSE',
  ENTRY: 'ENTRY',
  BLOCK_DATA: 'BLOCK_DATA',
  MODULE: 'MODULE',
  CONTAINS: 'CONTAINS',
  USE: 'USE',
  INTERFACE: 'INTERFACE',

  // Control flow
  IF: 'IF',
  THEN: 'THEN',
  ELSE: 'ELSE',
  ELSEIF: 'ELSEIF',
  ENDIF: 'ENDIF',
  DO: 'DO',
  ENDDO: 'ENDDO',
  DOWHILE: 'DOWHILE',
  CONTINUE: 'CONTINUE',
  GOTO: 'GOTO',
  SELECT: 'SELECT',
  CASE: 'CASE',
  WHERE: 'WHERE',
  FORALL: 'FORALL',
  CYCLE: 'CYCLE',
  EXIT: 'EXIT',

  // I/O
  READ: 'READ',
  WRITE: 'WRITE',
  PRINT: 'PRINT',
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  REWIND: 'REWIND',
  BACKSPACE: 'BACKSPACE',
  ENDFILE: 'ENDFILE',
  INQUIRE: 'INQUIRE',
  FORMAT: 'FORMAT',

  // Declarations
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  DOUBLE_PRECISION: 'DOUBLE_PRECISION',
  COMPLEX: 'COMPLEX',
  LOGICAL: 'LOGICAL',
  CHARACTER: 'CHARACTER',
  DIMENSION: 'DIMENSION',
  COMMON: 'COMMON',
  EQUIVALENCE: 'EQUIVALENCE',
  DATA: 'DATA',
  PARAMETER: 'PARAMETER',
  IMPLICIT: 'IMPLICIT',
  NONE: 'NONE',
  SAVE: 'SAVE',
  EXTERNAL: 'EXTERNAL',
  INTRINSIC: 'INTRINSIC',
  INTENT: 'INTENT',
  OPTIONAL: 'OPTIONAL',
  ALLOCATABLE: 'ALLOCATABLE',
  POINTER: 'POINTER',
  TARGET: 'TARGET',
  TYPE: 'TYPE',

  // Operators
  ASSIGN: 'ASSIGN',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  POWER: 'POWER',
  CONCAT: 'CONCAT',
  EQ: 'EQ',       // .EQ. or ==
  NE: 'NE',       // .NE. or /=
  LT: 'LT',       // .LT. or <
  GT: 'GT',       // .GT. or >
  LE: 'LE',       // .LE. or <=
  GE: 'GE',       // .GE. or >=
  AND: 'AND',     // .AND.
  OR: 'OR',       // .OR.
  NOT: 'NOT',     // .NOT.
  EQV: 'EQV',     // .EQV.
  NEQV: 'NEQV',   // .NEQV.
  TRUE: 'TRUE',   // .TRUE.
  FALSE: 'FALSE', // .FALSE.

  // Delimiters
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  COLON: 'COLON',
  DOUBLE_COLON: 'DOUBLE_COLON',
  PERCENT: 'PERCENT',

  // Literals
  INTEGER_LITERAL: 'INTEGER_LITERAL',
  REAL_LITERAL: 'REAL_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',
  HOLLERITH_LITERAL: 'HOLLERITH_LITERAL',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Unknown / error
  UNKNOWN: 'UNKNOWN',
});

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

module.exports = { TokenType, Token };
