var Engine = require('./diorama/engine');

var PARTS = [
  { id: 'COMP-01', index: 1, name: '钢支架' },
  { id: 'COMP-02', index: 2, name: '支座' },
  { id: 'COMP-03', index: 3, name: '灰斗' },
  { id: 'COMP-04', index: 4, name: '壳体' },
  { id: 'COMP-05', index: 5, name: '楼梯平台' },
  { id: 'COMP-06', index: 6, name: '阴阳极系统' },
  { id: 'COMP-07', index: 7, name: '进出口喇叭' },
  { id: 'COMP-08', index: 8, name: '保温箱' },
  { id: 'COMP-09', index: 9, name: '灰斗纳米涂层' },
  { id: 'COMP-10', index: 10, name: '振打系统' },
  { id: 'COMP-11', index: 11, name: '电气安装' },
  { id: 'COMP-12', index: 12, name: '顶部起吊系统' },
  { id: 'COMP-13', index: 13, name: '调试' }
];
var ASSEMBLY_ORDER = [2, 1, 3, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function partByIndex(index) { return PARTS[Math.max(1, Math.min(13, Number(index) || 1)) - 1]; }
function partById(id) { return PARTS.find(function (item) { return item.id === id; }); }

Component({
  properties: {
    projectName: { type: String, value: '' },
    deviceName: { type: String, value: '' },
    stageIndex: { type: Number, value: 1, observer: 'onStageChanged' },
    stageName: { type: String, value: '' },
    componentProgress: { type: Array, value: [], observer: 'onProgressChanged' },
    markers: { type: Array, value: [] },
    compact: { type: Boolean, value: false },
    minimal: { type: Boolean, value: false },
    light: { type: Boolean, value: false },
    animateAssembly: { type: Boolean, value: false },
    playToken: { type: Number, value: 0, observer: 'onPlayTokenChanged' },
    viewportHeight: { type: Number, value: 0, observer: 'onViewportChanged' }
  },

  data: {
    ready: false,
    loading: true,
    fallback: false,
    modelError: '',
    selectedPart: '',
    stageLabel: '钢支架安装',
    assembling: false,
    assemblyStageLabel: '',
    assemblyStepText: '',
    assemblyProgress: 0,
    qualityLabel: '均衡'
  },

  lifetimes: {
    ready: function () { this.initCanvas(); },
    detached: function () { this.dispose(); }
  },

  pageLifetimes: {
    show: function () { this.alive = true; this.startLoop(); },
    hide: function () { this.alive = false; this.stopLoop(); this.stopAssemblyReplay(false); }
  },

  methods: {
    onStageChanged: function (value) {
      var part = partByIndex(value);
      this.setData({ stageLabel: this.data.stageName || part.name + '安装' });
      if (this.engine && !this.replaying) {
        this.applyBusinessProgress();
      }
    },

    onProgressChanged: function (value) {
      this.progressRecords = this.normalizeProgress(value);
      if (this.engine && !this.replaying) this.applyBusinessProgress();
    },

    onPlayTokenChanged: function (value) {
      if (!Number(value) || !this.data.animateAssembly) return;
      this.pendingPlayToken = Number(value);
      if (this.engine) this.startAssemblyReplay();
    },

    onViewportChanged: function () {
      var self = this;
      if (!this.engine) return;
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(function () { self.resizeCanvas(); }, 0);
    },

    normalizeProgress: function (list) {
      if (!Array.isArray(list) || !list.length) return null;
      var records = {};
      var recognized = 0;
      PARTS.forEach(function (part) { records[part.id] = 0; });
      list.forEach(function (item) {
        var part = partByIndex(item && item.index);
        var value = Number(item && (item.installedProgress != null ? item.installedProgress : item.progress));
        if (part && Number.isFinite(value)) {
          records[part.id] = clamp(value, 0, 100);
          recognized += 1;
        }
      });
      return recognized ? records : null;
    },

    applyEmbeddedFraming: function () {
      if (!this.engine) return;
      this.engine.target = [0, 12, 0];
      this.engine.zoom = Number(this.cssWidth || 0) > Number(this.cssHeight || 1) * 1.35 ? 0.56 : 0.52;
      this.engine.intro = 7000;
      this.engine.lastInteraction = Number(this.engine.fxTime || 0) + 1;
      this.engine.matrices();
    },

    initCanvas: function () {
      var self = this;
      this.alive = true;
      this.createSelectorQuery().select('#constructionTwinCanvas').fields({ node: true, size: true, rect: true }).exec(function (rows) {
        var row = rows && rows[0];
        try {
          if (!row || !row.node) throw new Error('当前基础库无法初始化 WebGL');
          var canvas = row.node;
          var device = {};
          try { device = wx.getDeviceInfo ? wx.getDeviceInfo() : {}; } catch (ignore) {}
          var quality = Number(device.benchmarkLevel || 0) > 0 && Number(device.benchmarkLevel) < 10 ? 'low' : 'medium';
          var info = wx.getWindowInfo ? wx.getWindowInfo() : { pixelRatio: 1 };
          var dpr = Math.min(Number(info.pixelRatio || 1), quality === 'low' ? 1.2 : 1.55);
          canvas.width = Math.max(1, Math.round(row.width * dpr));
          canvas.height = Math.max(1, Math.round(row.height * dpr));
          self.canvas = canvas;
          self.cssWidth = row.width;
          self.cssHeight = row.height;
          self.left = Number(row.left || 0);
          self.top = Number(row.top || 0);
          self.dpr = dpr;
          self.engine = new Engine(canvas, row.width, row.height, quality);
          self.engine.phase = 5.1;
          self.engine.targetPhase = 5.1;
          self.engine.orbit = true;
          self.progressRecords = self.normalizeProgress(self.data.componentProgress);
          self.applyBusinessProgress();
          self.applyEmbeddedFraming();
          self.setData({ ready: true, loading: false, fallback: false, modelError: '', qualityLabel: quality === 'low' ? '流畅' : '均衡' });
          self.startLoop();
          if (self.data.animateAssembly && Number(self.data.playToken || self.pendingPlayToken)) self.startAssemblyReplay();
        } catch (error) {
          self.failModel(error.message || '模型渲染初始化失败');
        }
      });
    },

    resizeCanvas: function () {
      var self = this;
      if (!this.canvas || !this.engine) return;
      this.createSelectorQuery().select('#constructionTwinCanvas').fields({ size: true, rect: true }).exec(function (rows) {
        var row = rows && rows[0];
        if (!row || !row.width || !row.height || !self.canvas || !self.engine) return;
        self.cssWidth = row.width;
        self.cssHeight = row.height;
        self.left = Number(row.left || 0);
        self.top = Number(row.top || 0);
        self.canvas.width = Math.max(1, Math.round(row.width * self.dpr));
        self.canvas.height = Math.max(1, Math.round(row.height * self.dpr));
        self.engine.fit(row.width, row.height);
        self.applyEmbeddedFraming();
      });
    },

    applyBusinessProgress: function () {
      if (!this.engine) return;
      var records = this.progressRecords || this.normalizeProgress(this.data.componentProgress);
      var displayStage = partByIndex(this.data.stageIndex).index;
      if (records) {
        this.engine.applyProgress(records, displayStage, true);
        this.engine.phase = 5.1;
        this.engine.targetPhase = 5.1;
      } else {
        this.engine.scene.clearProgress();
        this.engine.scene.setDisplayStage(displayStage);
        this.engine.phase = 3.7;
        this.engine.targetPhase = 3.7;
      }
      this.engine.select(partByIndex(this.data.stageIndex).id);
      this.engine.isolation = null;
    },

    startLoop: function () {
      var self = this;
      if (this.raf || !this.alive || !this.engine || !this.canvas) return;
      this.lastFrame = 0;
      function frame(timestamp) {
        self.raf = null;
        if (!self.alive || !self.engine || !self.canvas) return;
        try {
          var delta = self.lastFrame ? Math.max(1, Number(timestamp) - self.lastFrame) : 16.7;
          self.lastFrame = Number(timestamp);
          self.engine.update(delta);
        } catch (error) {
          self.failModel(error.message || '模型渲染失败');
          return;
        }
        self.raf = self.canvas.requestAnimationFrame(frame);
      }
      this.raf = this.canvas.requestAnimationFrame(frame);
    },

    stopLoop: function () {
      if (this.raf && this.canvas && this.canvas.cancelAnimationFrame) this.canvas.cancelAnimationFrame(this.raf);
      this.raf = null;
      this.lastFrame = 0;
    },

    startAssemblyReplay: function () {
      if (!this.engine || !this.data.animateAssembly) return;
      this.stopAssemblyReplay(false);
      var self = this;
      var target = Object.assign({}, this.progressRecords || this.normalizeProgress(this.data.componentProgress));
      var visibleOrder = ASSEMBLY_ORDER.filter(function (index) {
        return index <= Number(self.data.stageIndex || 1);
      });
      if (!visibleOrder.length) {
        this.applyBusinessProgress();
        return;
      }
      var working = {};
      PARTS.forEach(function (part) { working[part.id] = 0; });
      this.replaying = true;
      this.engine.selection = null;
      this.engine.applyProgress(working, Number(this.data.stageIndex || 1), false);
      this.setData({ assembling: true, assemblyProgress: 0, assemblyStepText: '准备搭建', assemblyStageLabel: '施工沙盘' });
      var cursor = 0;
      function step() {
        if (!self.replaying || !self.engine) return;
        var part = partByIndex(visibleOrder[cursor]);
        working[part.id] = target[part.id];
        self.engine.applyProgress(working, Number(self.data.stageIndex || 1), false);
        self.engine.select(part.id);
        cursor += 1;
        self.setData({
          assemblyStageLabel: part.name,
          assemblyStepText: '第 ' + cursor + ' / ' + visibleOrder.length + ' 步',
          assemblyProgress: Math.round(cursor / visibleOrder.length * 100)
        });
        if (cursor < visibleOrder.length) self.assemblyTimer = setTimeout(step, 520);
        else self.assemblyTimer = setTimeout(function () { self.stopAssemblyReplay(true); }, 700);
      }
      this.assemblyTimer = setTimeout(step, 260);
    },

    stopAssemblyReplay: function (finish) {
      if (this.assemblyTimer) clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
      var wasReplaying = !!this.replaying;
      this.replaying = false;
      if (wasReplaying || this.data.assembling) this.setData({ assembling: false });
      if (finish && this.engine) this.applyBusinessProgress();
    },

    touchPoint: function (touch) {
      var x = touch.x != null ? touch.x : Number(touch.clientX || 0) - this.left;
      var y = touch.y != null ? touch.y : Number(touch.clientY || 0) - this.top;
      return { x: x, y: y };
    },

    touchStart: function (event) {
      if (!this.engine) return;
      if (this.replaying) this.stopAssemblyReplay(true);
      this.engine.interact();
      var points = (event.touches || []).map(this.touchPoint.bind(this));
      if (!points.length) return;
      this.gesture = { points: points, start: points[0], moved: points.length > 1 };
    },

    touchMove: function (event) {
      if (!this.engine || !this.gesture) return;
      var points = (event.touches || []).map(this.touchPoint.bind(this));
      var previous = this.gesture.points;
      if (points.length === 1 && previous.length === 1) {
        var dx = points[0].x - previous[0].x;
        var dy = points[0].y - previous[0].y;
        this.engine.rotate(dx, dy);
        if (Math.hypot(points[0].x - this.gesture.start.x, points[0].y - this.gesture.start.y) > 6) this.gesture.moved = true;
      } else if (points.length > 1 && previous.length > 1) {
        var distance = function (value) { return Math.hypot(value[0].x - value[1].x, value[0].y - value[1].y); };
        this.engine.zoomBy(Math.log(Math.max(1, distance(previous)) / Math.max(1, distance(points))));
        this.engine.pan((points[0].x + points[1].x - previous[0].x - previous[1].x) / 2, (points[0].y + points[1].y - previous[0].y - previous[1].y) / 2);
        this.gesture.moved = true;
      }
      this.gesture.points = points;
    },

    touchEnd: function () {
      var gesture = this.gesture;
      this.gesture = null;
      if (!gesture || gesture.moved || !gesture.start || !this.engine) return;
      var selected = this.engine.pick(gesture.start.x, gesture.start.y);
      if (!selected || !selected.id) return;
      var part = partById(selected.id);
      if (!part) return;
      this.setData({ selectedPart: part.name });
      this.triggerEvent('parttap', { id: part.id, name: part.name, stageIndex: part.index, progress: selected.progress });
    },

    touchCancel: function () { this.gesture = null; },

    markerTap: function (event) {
      var marker = (this.data.markers || [])[Number(event.currentTarget.dataset.index)];
      if (marker) this.triggerEvent('markertap', { id: marker.id, defect: marker });
    },

    resetView: function () {
      if (!this.engine) return;
      if (this.replaying) this.stopAssemblyReplay(true);
      this.applyEmbeddedFraming();
      this.engine.select(partByIndex(this.data.stageIndex).id);
      this.setData({ selectedPart: '' });
    },

    replayAssembly: function () { this.startAssemblyReplay(); },

    failModel: function (message) {
      console.error('[construction-twin-3d]', message);
      this.stopLoop();
      this.setData({ loading: false, fallback: true, ready: false, modelError: message });
    },

    retryModel: function () {
      this.dispose();
      this.setData({ fallback: false, loading: true, modelError: '' });
      this.initCanvas();
    },

    dispose: function () {
      this.alive = false;
      this.stopAssemblyReplay(false);
      this.stopLoop();
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
      if (this.engine) this.engine.destroy();
      this.engine = null;
      this.canvas = null;
      this.gesture = null;
    }
  }
});
