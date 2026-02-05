const columnLayoutRules = require('./column-layout');
const programStructureRules = require('./program-structure');
const controlFlowRules = require('./control-flow');
const declarationRules = require('./declarations');
const ioRules = require('./io-rules');
const obsolescentRules = require('./obsolescent');
const styleRules = require('./style');

const allRules = [
  ...columnLayoutRules,
  ...programStructureRules,
  ...controlFlowRules,
  ...declarationRules,
  ...ioRules,
  ...obsolescentRules,
  ...styleRules,
];

module.exports = {
  allRules,
  columnLayoutRules,
  programStructureRules,
  controlFlowRules,
  declarationRules,
  ioRules,
  obsolescentRules,
  styleRules,
};
