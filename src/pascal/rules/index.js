const structureRules = require('./structure');
const typeRules = require('./types');
const controlFlowRules = require('./control-flow');
const styleRules = require('./style');
const ioRules = require('./io');

const allPascalRules = [
  ...structureRules,
  ...typeRules,
  ...controlFlowRules,
  ...styleRules,
  ...ioRules,
];

module.exports = {
  allPascalRules,
  structureRules,
  typeRules,
  controlFlowRules,
  styleRules,
  ioRules,
};
