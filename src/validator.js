const { ValidationEngine } = require('./engine');
const { allRules } = require('./rules');

/**
 * Create a fully-configured Fortran validator with all rules loaded.
 */
function createValidator() {
  const engine = new ValidationEngine();
  engine.registerRules(allRules);
  return engine;
}

module.exports = { createValidator };
