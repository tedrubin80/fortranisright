const { PascalInterpreter, RuntimeError } = require('./interpreter');
const { Parser, ParseError } = require('./parser');

module.exports = { PascalInterpreter, Parser, ParseError, RuntimeError };
