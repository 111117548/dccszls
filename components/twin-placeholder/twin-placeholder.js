Component({
  properties: {
    projectName: { type: String, value: '' },
    deviceName: { type: String, value: '' },
    stageIndex: { type: Number, value: 1 },
    stageName: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },
  data: {
    moduleStatus: 'RESERVED',
    geometrySummary: 'G793 · 四室五电场 · 4进4出 · 20灰斗'
  }
});
