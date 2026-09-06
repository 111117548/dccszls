var ROOT = '/assets/icon-review-v1/';

var ICONS = {
  espUnit: ROOT + '01-esp-unit.svg',
  electricField: ROOT + '02-electric-field.svg',
  ashHopper: ROOT + '03-ash-hopper.svg',
  dischargeElectrode: ROOT + '04-discharge-electrode.svg',
  collectingPlate: ROOT + '05-collecting-plate.svg',
  transformerRectifier: ROOT + '06-transformer-rectifier.svg',
  rappingSystem: ROOT + '07-rapping-system.svg',
  flueDuct: ROOT + '08-flue-duct.svg',
  engineeringInspection: ROOT + '09-engineering-inspection.svg',
  constructionHelmet: ROOT + '10-construction-helmet.svg',
  welding: ROOT + '11-welding.svg',
  craneLifting: ROOT + '12-crane-lifting.svg'
};

var STAGE_ICONS = {
  1: ICONS.welding,
  2: ICONS.constructionHelmet,
  3: ICONS.ashHopper,
  4: ICONS.craneLifting,
  5: ICONS.craneLifting,
  6: ICONS.electricField,
  7: ICONS.flueDuct,
  8: ICONS.espUnit,
  9: ICONS.engineeringInspection,
  10: ICONS.rappingSystem,
  11: ICONS.transformerRectifier,
  12: ICONS.craneLifting,
  13: ICONS.engineeringInspection
};

function forStage(index) {
  return STAGE_ICONS[Math.max(1, Math.min(13, Number(index) || 1))] || ICONS.espUnit;
}

function withStageIcon(stage) {
  return Object.assign({}, stage || {}, { iconPath: forStage(stage && stage.index) });
}

function forNodeType(type) {
  var key = String(type || '').toLowerCase();
  if (key === 'chamber') return ICONS.espUnit;
  if (key === 'electric-field') return ICONS.electricField;
  if (key === 'hopper') return ICONS.ashHopper;
  if (key === 'anode') return ICONS.collectingPlate;
  if (key === 'cathode' || key === 'cathode-frame') return ICONS.dischargeElectrode;
  if (key === 'rapping') return ICONS.rappingSystem;
  return ICONS.engineeringInspection;
}

module.exports = {
  ICONS: ICONS,
  forStage: forStage,
  withStageIcon: withStageIcon,
  forNodeType: forNodeType
};
