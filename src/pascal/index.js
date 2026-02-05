const { PascalLexer, PascalTokenType, PascalToken } = require('./lexer');
const { PascalValidationEngine } = require('./engine');
const { allPascalRules } = require('./rules');
const { PascalInterpreter } = require('./interpreter');

function createPascalValidator() {
  const engine = new PascalValidationEngine();
  engine.registerRules(allPascalRules);
  return engine;
}

module.exports = {
  PascalLexer,
  PascalTokenType,
  PascalToken,
  PascalValidationEngine,
  PascalInterpreter,
  allPascalRules,
  createPascalValidator,
};
