Component({
  data: {
    hopperUnits: [1, 2, 3, 4, 5],
    supportUnits: [1, 2, 3, 4, 5, 6],
    chambers: [],
    modelDefects: [],
    componentLayers: [],
    leftCallouts: [],
    rightCallouts: [],
    layerContext: 'A室 · 第1电场'
  },
  properties: {
    regions: { type: Array, value: [] },
    defects: { type: Array, value: [] },
    selectedNodeId: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },
  observers: {
    'regions, defects, selectedNodeId': function (regions, defects, selectedNodeId) {
      var list = regions || [];
      var chambers = ['A', 'B'].map(function (code) {
        var prefix = code.toLowerCase();
        var chamberRegions = list.filter(function (item) { return item.chamber === code; });
        return {
          code: code, name: code + '室', shellId: prefix + '-shell',
          inletId: prefix + '-inlet', outletId: prefix + '-outlet',
          hoppers: [1, 2, 3, 4, 5].map(function (number) { return { number: number, id: prefix + '-hopper-' + number }; }),
          regions: chamberRegions,
          fieldRegions: chamberRegions.filter(function (item) { return item.kind === 'field'; })
        };
      });
      var positions = {};
      chambers.forEach(function (chamber, chamberIndex) {
        chamber.fieldRegions.forEach(function (region, regionIndex) {
          positions[region.id] = { x: (chamberIndex === 0 ? 30 : 55) + regionIndex * 4.8, y: 42 };
        });
        positions[chamber.inletId] = { x: 21, y: 48 };
        positions[chamber.outletId] = { x: 79, y: 48 };
      });
      var modelDefects = (defects || []).map(function (item) {
        var base = positions[item.markerRegionId] || { x: 50, y: 48 };
        return Object.assign({}, item, { markerX: base.x, markerY: base.y });
      });
      var fieldMatch = /^([ab])-field-([1-5])/.exec(selectedNodeId || '');
      var chamberCode = fieldMatch ? fieldMatch[1] : 'a';
      var fieldNo = fieldMatch ? Number(fieldMatch[2]) : 1;
      var fieldPrefix = chamberCode + '-field-' + fieldNo;
      var componentLayers = [
        { code: 'HO', name: '顶部起吊', nodeId: 'top-hoist', group: '外部' },
        { code: 'ST', name: '钢支架', nodeId: 'steel-support', group: '外部' },
        { code: 'HV', name: '高压进线', nodeId: chamberCode + '-hvline', group: '外部' },
        { code: 'HP', name: '灰斗', nodeId: chamberCode + '-hopper-' + fieldNo, group: '外部' },
        { code: 'HR', name: '进出口喇叭', nodeId: chamberCode + '-inlet', group: '外部' },
        { code: 'SH', name: '壳体', nodeId: chamberCode + '-shell', group: '外部' },
        { code: 'AP', name: '阳极系统', nodeId: fieldPrefix + '-anode', group: '内部' },
        { code: 'CF', name: '阴极框架组合', nodeId: fieldPrefix + '-cathode-frame', group: '内部' },
        { code: 'CS', name: '阴极系统', nodeId: fieldPrefix + '-cathode-install', group: '内部' },
        { code: 'RP', name: '振打系统', nodeId: fieldPrefix + '-rapping', group: '内部' },
        { code: 'BR', name: '支座', nodeId: 'support-bearing', group: '外部' }
      ];
      var leftCallouts = componentLayers.filter(function (item) { return ['HO', 'HV', 'HR', 'SH', 'ST'].indexOf(item.code) !== -1; });
      var rightCallouts = componentLayers.filter(function (item) { return ['AP', 'CF', 'CS', 'RP', 'BR'].indexOf(item.code) !== -1; });
      this.setData({
        chambers: chambers,
        modelDefects: modelDefects,
        componentLayers: componentLayers,
        leftCallouts: leftCallouts,
        rightCallouts: rightCallouts,
        layerContext: chamberCode.toUpperCase() + '室 · 第' + fieldNo + '电场'
      });
    }
  },
  methods: {
    onRegionTap: function (e) {
      var id = e.currentTarget.dataset.id;
      var region = null;
      for (var i = 0; i < this.data.regions.length; i++) {
        if (this.data.regions[i].id === id) region = this.data.regions[i];
      }
      this.triggerEvent('nodetap', { id: id, region: region });
    },
    onMarkerTap: function (e) {
      this.triggerEvent('defecttap', e.detail);
    }
  }
});
