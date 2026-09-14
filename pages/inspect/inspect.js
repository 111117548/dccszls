// pages/inspect/inspect.js — V2.0
var util = require('../../utils/util.js');
var data = require('../../utils/data.js');
var v3Data = require('../../utils/v3-data.js');
var app = getApp();

Page({
  data: {
    // ===== Tab State =====
    activeTab: 'photo', // 'photo' | 'checklist'

    // ===== Area Selection =====
    areaList: util.areaOptions.map(function (a) {
      var info = data.checklistData[a.key];
      return { key: a.key, name: a.name, icon: info ? info.icon : '' };
    }),
    areaNames: util.areaOptions.map(function (a) { return a.name; }),
    areaIndex: 0,
    // V3.0 equipment-space context
    deviceOptions: v3Data.getInspectionDeviceOptions(),
    deviceNames: v3Data.getInspectionDeviceOptions().map(function (n) { return n.name; }),
    deviceIndex: 0,
    selectedDeviceId: 'a1-shell',
    inspectionItemNames: [],
    inspectionItems: [],
    inspectionItemIndex: 0,
    selectedInspectionItemId: '',
    inspectionMethodKey: 'visual_ai',
    inspectionMethodName: '智能视觉',
    inspectionAiApplicable: true,
    inspectionEvidenceHint: '',
    standardSource: '',
    constructionStageName: '',
    positionCode: '',
    shootingGuide: '保持设备主体完整入镜，镜头与检查面尽量垂直，避免逆光和遮挡。',

    // ===== Photo =====
    tempFilePath: '',
    canvasHeight: 300,

    // ===== Canvas Drawing =====
    drawTool: 'marker',    // 'marker' | 'rect' | 'arrow' | 'text'
    drawColor: '#ff3b5c',
    lineWidth: 3,
    showTextModal: false,
    textInputValue: '',

    // ===== AI Analysis =====
    aiLoading: false,
    aiLoadingText: '',
    aiProgress: 0,
    aiResult: null,
    inspectionCommitted: false,
    committedRecordId: '',
    rectificationOrderId: '',
    rectificationOrderNo: '',
    rectificationStatusName: '',
    rectificationShareToken: '',
    isDemoMode: true,
    majorCount: 0,
    moderateCount: 0,
    minorCount: 0,
    normalItemCount: 0,
    abnormalItemCount: 0,
    uncertainItemCount: 0,

    // ===== V2.0 AI State =====
    aiPhase: 'idle',           // 'idle' | 'quality' | 'analysis'
    qualityResult: null,       // {clarity, exposure, distance, obstruction, usable, qualityMessage}
    detectedAreaKey: '',       // auto-detected area key
    detectedAreaName: '',      // Chinese name
    areaConfidence: 0,         // 0-100 percentage
    areaDescription: '',       // description of detected area
    itemResults: [],           // [{itemId, title, status, confidence, reason, statusIcon, statusText, confidencePercent, expanded, defectId}]
    showBbox: true,            // toggle bbox overlay
    activeDefectId: -1,        // highlighted defect on canvas
    showMissedDefectModal: false,
    missedDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' },
    editingDefectIndex: -1,    // -1 means not editing
    showEditDefectModal: false,
    editDefectForm: { severity: '', description: '', suggestion: '' },
    manualAreaOverride: false, // user manually selected area different from auto-detect

    // ===== Checklist =====
    checkArea: 'shell',
    checkItemsWithState: [],
    checkItems: [],
    checklistTip: '',
    checkPassCount: 0,
    checkFailCount: 0,
    checkWarnCount: 0,

    // ===== Sample Learning =====
    confirmedDefects: [],  // tracks which defect indices are confirmed for sample learning
    contextProject: {},
    contextDevice: {},
    aiStats: { pendingConfirm: 0, pending: 0, review: 0, closed: 0 },
    attentionCount: 0,
    openTasks: []
  },

  // ===== Internal canvas state (not in data) =====
  _canvas: null,
  _ctx: null,
  _canvasW: 0,
  _canvasH: 0,
  _drawHistory: [],   // array of drawing operations for undo
  _isDrawing: false,
  _startX: 0,
  _startY: 0,
  _lastX: 0,
  _lastY: 0,
  _textPosX: 0,
  _textPosY: 0,
  _aiTimer: null,

  onLoad: function () {
    this.setData({ isDemoMode: !!app.globalData.aiConfig.demoMode });
    this._initChecklist('shell');
    this._applyEntryContext();
  },

  onShow: function () {
    this.setData({ isDemoMode: !!app.globalData.aiConfig.demoMode });
    var hasNewEntryContext = !!(app.globalData.selectedDeviceNodeId || app.globalData.selectedArea);
    if (hasNewEntryContext && this.data.aiResult) {
      this.setData({ aiResult: null, itemResults: [], inspectionCommitted: false, committedRecordId: '' });
    }
    // 返回图片预览或其他临时界面时，不重置当前草稿的检查项绑定。
    if (hasNewEntryContext || !this.data.aiResult) this._applyEntryContext();
    if (this.data.rectificationOrderId) {
      var self = this;
      app.refreshProjectCloudState().then(function () {
        var order = app.getRectificationOrder(self.data.rectificationOrderId);
        if (order) self.setData({ rectificationStatusName: order.statusName || '待整改' });
      }).catch(function () {});
    }
    this._loadAISummary();
  },

  _loadAISummary: function () {
    var context = app.getFoundationContext();
    var state = app.getV3State();
    var orders = (state.rectificationOrders || []).filter(function (item) {
      return (!item.projectId || item.projectId === context.project.id) &&
        (!item.deviceId || item.deviceId === context.device.id);
    });
    var pendingConfirm = (state.inspections || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id && item.status === 'draft';
    }).length;
    var statusNames = { pending: '待整改', rectifying: '整改中', review: '待复验', closed: '已闭环', rejected: '复验退回' };
    var pendingCount = orders.filter(function (item) { return item.status === 'pending' || item.status === 'rectifying' || item.status === 'rejected'; }).length;
    var reviewCount = orders.filter(function (item) { return item.status === 'review'; }).length;
    this.setData({
      contextProject: context.project,
      contextDevice: context.device,
      aiStats: {
        pendingConfirm: pendingConfirm,
        pending: pendingCount,
        review: reviewCount,
        closed: orders.filter(function (item) { return item.status === 'closed'; }).length
      },
      attentionCount: pendingCount + reviewCount,
      openTasks: orders.filter(function (item) { return item.status !== 'closed'; }).map(function (item) {
        return Object.assign({}, item, {
          title: item.title || (item.items && item.items[0] && item.items[0].name) || '智能缺陷整改任务',
          statusName: item.statusName || statusNames[item.status] || '待整改'
        });
      })
    });
    app.updateTabBarReminderBadges();
  },

  openRecentTask: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(id) + '&from=creator' });
  },

  goRectificationCenter: function () {
    wx.navigateTo({ url: '/pages/history/history?tab=rectification' });
  },

  onUnload: function () {
    if (this._aiTimer) {
      clearInterval(this._aiTimer);
      this._aiTimer = null;
    }
  },

  // ========================================================
  // ===== Tab Switching =====
  // ========================================================

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'checklist') {
      this._refreshChecklistState();
    }
  },

  // ========================================================
  // ===== Area Selection =====
  // ========================================================

  onAreaChange: function (e) {
    var idx = parseInt(e.detail.value);
    this.setData({
      areaIndex: idx,
      aiResult: null,
      majorCount: 0,
      moderateCount: 0,
      minorCount: 0,
      itemResults: [],
      activeDefectId: -1,
      manualAreaOverride: true
    });
    this._refreshInspectionItems();
  },

  _applyEntryContext: function () {
    var deviceId = app.globalData.selectedDeviceNodeId || this.data.selectedDeviceId;
    var deviceOptions = this.data.deviceOptions;
    var deviceIndex = 0;
    for (var i = 0; i < deviceOptions.length; i++) if (deviceOptions[i].id === deviceId) deviceIndex = i;
    var areaKey = (app.globalData.selectedArea && app.globalData.selectedArea.key) || deviceOptions[deviceIndex].areaKey;
    var areaIndex = 0;
    for (var j = 0; j < this.data.areaList.length; j++) if (this.data.areaList[j].key === areaKey) areaIndex = j;
    this.setData({ deviceIndex: deviceIndex, selectedDeviceId: deviceOptions[deviceIndex].id, areaIndex: areaIndex, checkArea: areaKey });
    this._refreshInspectionItems();
    app.globalData.selectedDeviceNodeId = null;
    app.globalData.selectedArea = null;
  },

  onDeviceChange: function (e) {
    var idx = parseInt(e.detail.value);
    var option = this.data.deviceOptions[idx];
    var areaIndex = 0;
    for (var i = 0; i < this.data.areaList.length; i++) if (this.data.areaList[i].key === option.areaKey) areaIndex = i;
    this.setData({
      deviceIndex: idx,
      selectedDeviceId: option.id,
      areaIndex: areaIndex,
      manualAreaOverride: false,
      aiResult: null,
      inspectionCommitted: false,
      committedRecordId: '',
      rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: ''
    });
    this._refreshInspectionItems();
  },

  _refreshInspectionItems: function () {
    var area = this.data.areaList[this.data.areaIndex];
    var areaData = area ? data.checklistData[area.key] : null;
    var items = areaData ? areaData.items : [];
    var selectedOption = this.data.deviceOptions[this.data.deviceIndex] || {};
    if (area && area.key === 'cathode' && selectedOption.type === 'cathode-frame') {
      items = items.filter(function (item) { return Number(String(item.id).replace('c', '')) >= 15; });
    } else if (area && area.key === 'cathode' && selectedOption.type === 'cathode-install') {
      items = items.filter(function (item) { return Number(String(item.id).replace('c', '')) <= 14; });
    }
    items = items.map(function (item) {
      var decorated = Object.assign({}, item);
      decorated.inspectionMethod = util.getInspectionMethod(item);
      return decorated;
    });
    var stageId = selectedOption.stageId || (areaData ? areaData.constructionStageId : '');
    var stage = (v3Data.CONSTRUCTION_STAGES || []).filter(function (item) { return item.id === stageId; })[0];
    var firstMethod = items.length ? items[0].inspectionMethod : util.getInspectionMethod({});
    this.setData({
      inspectionItemNames: items.map(function (item) { return item.title; }),
      inspectionItems: items,
      inspectionItemIndex: 0,
      selectedInspectionItemId: items.length ? items[0].id : '',
      inspectionMethodKey: firstMethod.key,
      inspectionMethodName: firstMethod.name,
      inspectionAiApplicable: firstMethod.aiApplicable,
      inspectionEvidenceHint: firstMethod.evidenceHint,
      standardSource: areaData ? areaData.sourceDocument : '',
      constructionStageName: stage ? stage.name : '',
      shootingGuide: items.length ? ('拍摄重点：' + (items[0].visualCues || items[0].desc || items[0].title) + '。保持镜头与检查面垂直，确保连接部位清晰可见。') : '保持设备主体完整入镜，避免逆光、遮挡和异常倾斜。'
    });
  },

  onInspectionItemChange: function (e) {
    var idx = parseInt(e.detail.value);
    var items = this.data.inspectionItems; var item = items[idx];
    var method = item.inspectionMethod || util.getInspectionMethod(item);
    this.setData({
      inspectionItemIndex: idx,
      selectedInspectionItemId: item.id,
      inspectionMethodKey: method.key,
      inspectionMethodName: method.name,
      inspectionAiApplicable: method.aiApplicable,
      inspectionEvidenceHint: method.evidenceHint,
      aiResult: null,
      inspectionCommitted: false,
      committedRecordId: '', rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: '',
      shootingGuide: '拍摄重点：' + (item.visualCues || item.desc || item.title) + '。画面应覆盖完整构件及其连接关系。'
    });
  },

  onPositionInput: function (e) { this.setData({ positionCode: e.detail.value }); },

  goBatch: function () {
    wx.navigateTo({ url: '/pages/batch/batch' });
  },
  goQualityLedger: function () {
    wx.navigateTo({ url: '/pages/history/history?tab=rectification' });
  },
  goReports: function () {
    wx.navigateTo({ url: '/pages/report-center/report-center' });
  },

  _getCurrentArea: function () {
    return this.data.areaList[this.data.areaIndex];
  },

  confirmAreaOverride: function () {
    this.setData({
      manualAreaOverride: true,
      aiResult: null,
      majorCount: 0,
      moderateCount: 0,
      minorCount: 0,
      itemResults: [],
      activeDefectId: -1
    });
  },

  // ========================================================
  // ===== Photo Selection =====
  // ========================================================

  takePhoto: function () {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var filePath = res.tempFiles[0].tempFilePath;
        self._onPhotoSelected(filePath);
      }
    });
  },

  chooseFromAlbum: function () {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: function (res) {
        var filePath = res.tempFiles[0].tempFilePath;
        self._onPhotoSelected(filePath);
      }
    });
  },

  _onPhotoSelected: function (filePath) {
    var self = this;
    // Get image info to calculate canvas height
    wx.getImageInfo({
      src: filePath,
      success: function (info) {
        var sysInfo = wx.getSystemInfoSync();
        var screenW = sysInfo.windowWidth - 48; // 24rpx padding each side
        var ratio = info.height / info.width;
        var canvasH = Math.round(screenW * ratio);
        // Cap height to prevent excessively tall canvas
        if (canvasH > 800) canvasH = 800;
        if (canvasH < 200) canvasH = 200;

        self.setData({
          tempFilePath: filePath,
          canvasHeight: canvasH,
          aiResult: null,
          majorCount: 0,
          moderateCount: 0,
          minorCount: 0,
          qualityResult: null,
          detectedAreaKey: '',
          detectedAreaName: '',
          areaConfidence: 0,
          itemResults: [],
          aiPhase: 'idle',
          inspectionCommitted: false,
          committedRecordId: '',
          rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: '',
          showBbox: true,
          activeDefectId: -1,
          manualAreaOverride: false
        });

        // Reset drawing history
        self._drawHistory = [];

        // Init canvas after a short delay for DOM rendering
        setTimeout(function () {
          self._initCanvas(filePath);
        }, 300);
      }
    });
  },

  removePhoto: function () {
    this.setData({
      tempFilePath: '',
      aiResult: null,
      majorCount: 0,
      moderateCount: 0,
      minorCount: 0,
      qualityResult: null,
      detectedAreaKey: '',
      detectedAreaName: '',
      areaConfidence: 0,
      itemResults: [],
      aiPhase: 'idle',
      inspectionCommitted: false,
      committedRecordId: '', rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: '',
      showBbox: true,
      activeDefectId: -1,
      manualAreaOverride: false
    });
    this._canvas = null;
    this._ctx = null;
    this._drawHistory = [];
  },

  retakePhoto: function () {
    this.removePhoto();
    this.takePhoto();
  },

  previewImage: function () {
    if (!this.data.tempFilePath) return;
    wx.previewImage({
      urls: [this.data.tempFilePath],
      current: this.data.tempFilePath
    });
  },

  // ========================================================
  // ===== Canvas Annotation =====
  // ========================================================

  _initCanvas: function (imagePath) {
    var self = this;
    var query = wx.createSelectorQuery();
    query.select('#annotateCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;

        var canvas = res[0].node;
        var ctx = canvas.getContext('2d');
        var dpr = wx.getSystemInfoSync().pixelRatio;
        var w = res[0].width;
        var h = res[0].height;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        self._canvas = canvas;
        self._ctx = ctx;
        self._canvasW = w;
        self._canvasH = h;

        // Draw the image
        var img = canvas.createImage();
        img.src = imagePath;
        img.onload = function () {
          ctx.drawImage(img, 0, 0, w, h);
          // Save base state
          self._drawHistory = [{ type: 'image', path: imagePath }];
        };
      });
  },

  _redrawCanvas: function () {
    var self = this;
    if (!self._canvas || !self._ctx) return;

    var ctx = self._ctx;
    var w = self._canvasW;
    var h = self._canvasH;
    var history = self._drawHistory;
    var canvas = self._canvas;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Replay all drawings
    var imageEntry = history[0];
    if (imageEntry && imageEntry.type === 'image') {
      var img = canvas.createImage();
      img.src = imageEntry.path;
      img.onload = function () {
        ctx.drawImage(img, 0, 0, w, h);
        // Replay annotations
        for (var i = 1; i < history.length; i++) {
          self._replayStroke(history[i]);
        }
        // After annotations, draw bbox overlay if applicable
        if (self.data.aiResult && self.data.showBbox) {
          self._drawBboxOverlay();
        }
      };
    }
  },

  _replayStroke: function (stroke) {
    var ctx = this._ctx;
    ctx.save();
    ctx.strokeStyle = stroke.color || '#ff3b5c';
    ctx.lineWidth = stroke.lineWidth || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.type === 'marker') {
      ctx.beginPath();
      if (stroke.points && stroke.points.length > 0) {
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (var i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
      }
      ctx.stroke();
    } else if (stroke.type === 'rect') {
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === 'arrow') {
      this._drawArrow(ctx, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color);
    } else if (stroke.type === 'text') {
      ctx.fillStyle = stroke.color || '#ff3b5c';
      ctx.font = 'bold ' + (stroke.fontSize || 16) + 'px sans-serif';
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    }
    ctx.restore();
  },

  _drawArrow: function (ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color || '#ff3b5c';
    ctx.fillStyle = color || '#ff3b5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var headLen = 14;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  // --- Drawing Tools ---

  setDrawTool: function (e) {
    this.setData({ drawTool: e.currentTarget.dataset.tool });
  },

  setDrawColor: function (e) {
    this.setData({ drawColor: e.currentTarget.dataset.color });
  },

  onLineWidthChange: function (e) {
    this.setData({ lineWidth: e.detail.value });
  },

  // --- Touch Events ---

  onCanvasTouchStart: function (e) {
    if (!this._ctx) return;
    var touch = e.touches[0];
    var x = touch.x;
    var y = touch.y;

    this._isDrawing = true;
    this._startX = x;
    this._startY = y;
    this._lastX = x;
    this._lastY = y;

    if (this.data.drawTool === 'marker') {
      this._currentPoints = [{ x: x, y: y }];
      this._ctx.beginPath();
      this._ctx.moveTo(x, y);
      this._ctx.strokeStyle = this.data.drawColor;
      this._ctx.lineWidth = this.data.lineWidth;
      this._ctx.lineCap = 'round';
      this._ctx.lineJoin = 'round';
    } else if (this.data.drawTool === 'text') {
      this._isDrawing = false;
      this._textPosX = x;
      this._textPosY = y;
      this.setData({ showTextModal: true, textInputValue: '' });
    }
  },

  onCanvasTouchMove: function (e) {
    if (!this._ctx || !this._isDrawing) return;
    var touch = e.touches[0];
    var x = touch.x;
    var y = touch.y;
    var tool = this.data.drawTool;
    var ctx = this._ctx;

    if (tool === 'marker') {
      this._currentPoints.push({ x: x, y: y });
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (tool === 'rect' || tool === 'arrow') {
      // Redraw everything then draw preview shape
      this._redrawCanvas();
      // Use setTimeout to let redraw complete first
      var self = this;
      setTimeout(function () {
        if (tool === 'rect') {
          ctx.save();
          ctx.strokeStyle = self.data.drawColor;
          ctx.lineWidth = self.data.lineWidth;
          ctx.strokeRect(self._startX, self._startY, x - self._startX, y - self._startY);
          ctx.restore();
        } else if (tool === 'arrow') {
          self._drawArrow(ctx, self._startX, self._startY, x, y, self.data.drawColor);
        }
      }, 0);
    }

    this._lastX = x;
    this._lastY = y;
  },

  onCanvasTouchEnd: function (e) {
    if (!this._isDrawing) return;
    this._isDrawing = false;

    var tool = this.data.drawTool;
    var color = this.data.drawColor;
    var lw = this.data.lineWidth;

    if (tool === 'marker' && this._currentPoints && this._currentPoints.length > 1) {
      this._drawHistory.push({
        type: 'marker',
        color: color,
        lineWidth: lw,
        points: this._currentPoints.slice()
      });
      this._currentPoints = [];
    } else if (tool === 'rect') {
      var w = this._lastX - this._startX;
      var h = this._lastY - this._startY;
      if (Math.abs(w) > 5 && Math.abs(h) > 5) {
        this._drawHistory.push({
          type: 'rect',
          color: color,
          lineWidth: lw,
          x: this._startX,
          y: this._startY,
          w: w,
          h: h
        });
      }
    } else if (tool === 'arrow') {
      var dx = this._lastX - this._startX;
      var dy = this._lastY - this._startY;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        this._drawHistory.push({
          type: 'arrow',
          color: color,
          lineWidth: lw,
          x1: this._startX,
          y1: this._startY,
          x2: this._lastX,
          y2: this._lastY
        });
      }
    }
  },

  undoCanvas: function () {
    if (this._drawHistory.length <= 1) return; // keep base image
    this._drawHistory.pop();
    this._redrawCanvas();
  },

  clearCanvas: function () {
    if (this._drawHistory.length <= 1) return;
    var base = this._drawHistory[0];
    this._drawHistory = [base];
    this._redrawCanvas();
  },

  // --- Text Tool Modal ---

  onTextInput: function (e) {
    this.setData({ textInputValue: e.detail.value });
  },

  closeTextModal: function () {
    this.setData({ showTextModal: false, textInputValue: '' });
  },

  confirmTextInput: function () {
    var text = this.data.textInputValue;
    if (!text) {
      this.setData({ showTextModal: false });
      return;
    }
    this._drawHistory.push({
      type: 'text',
      color: this.data.drawColor,
      fontSize: 16,
      text: text,
      x: this._textPosX,
      y: this._textPosY
    });
    this._redrawCanvas();
    this.setData({ showTextModal: false, textInputValue: '' });
  },

  // ========================================================
  // ===== AI Analysis — V2.0 Two-Step Flow =====
  // ========================================================

  runAIAnalysis: function () {
    if (!this.data.tempFilePath) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }

    if (!this.data.selectedDeviceId || !this.data.selectedInspectionItemId) {
      wx.showToast({ title: '请先选择设备构件和检查项目', icon: 'none' });
      return;
    }
    if (!String(this.data.positionCode || '').trim()) {
      wx.showToast({ title: '请填写具体施工空间位置', icon: 'none' });
      return;
    }
    if (!this.data.inspectionAiApplicable) {
      wx.showModal({
        title: this.data.inspectionMethodName + '项目',
        content: this.data.inspectionEvidenceHint + '\n\n该项目不能仅凭单张照片由智能检测判定，请在检查清单中录入人工结论。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    var self = this;
    var config = app.globalData.aiConfig;
    self.setData({ isDemoMode: !!config.demoMode, inspectionCommitted: false, committedRecordId: '' });

    // Demo mode: skip quality check, go straight to demo result
    if (config.demoMode) {
      var area = this._getCurrentArea();
      var areaKey = area.key;
      var areaName = area.name;

      self.setData({
        aiLoading: true,
        aiLoadingText: '正在生成演示结果...',
        aiProgress: 0,
        aiResult: null,
        aiPhase: 'analysis'
      });

      // Progress animation for demo
      var progress = 0;
      self._aiTimer = setInterval(function () {
        progress += Math.random() * 15 + 5;
        if (progress > 90) progress = 90;
        self.setData({ aiProgress: progress });
      }, 400);

      setTimeout(function () {
        var demoResult = util.getDemoDefects(areaKey);
        self._onAIResultReady(demoResult, areaKey, areaName);
      }, 2000);

      return;
    }

    // Real AI mode: use one multimodal request to return photo quality,
    // component recognition and defect results together. The former two-call
    // flow was too easy to time out under WeChat Cloud's 60-second limit.
    self.setData({
      aiLoading: true,
      aiLoadingText: '正在进行照片质量与缺陷联合分析...',
      aiProgress: 0,
      aiResult: null,
      qualityResult: null,
      aiPhase: 'analysis'
    });
    var filePath = self.data.tempFilePath;
    return self._runDetailedAnalysis(filePath, config, 0);
  },

  _runDetailedAnalysis: function (filePath, config, initialProgress) {
    var self = this;
    self.setData({ aiLoading: true, aiPhase: 'analysis', aiLoadingText: '正在分析照片与当前检查项...' });

    var progress = Number(initialProgress) || 0;
    var analysisTexts = ['正在分析照片与当前检查项...', '正在判断照片质量...', '正在核对可见特征...', '正在比对检查标准...', '正在生成待复核草稿...'];
    var textIdx = 0;
    self._aiTimer = setInterval(function () {
      progress += Math.random() * 8 + 2;
      if (progress > 92) progress = 92;
      textIdx = Math.min(textIdx + 1, analysisTexts.length - 1);
      self.setData({ aiProgress: progress, aiLoadingText: analysisTexts[textIdx] });
    }, 600);

    var currentArea = self._getCurrentArea();
    var selectedItem = self.data.inspectionItems[self.data.inspectionItemIndex] || {};
    var inspectionItemIds = self.data.selectedInspectionItemId ? [self.data.selectedInspectionItemId] : [];
    var deviceContext = self.data.deviceNames[self.data.deviceIndex] + ' / ' + self.data.positionCode +
      ' / 检查项：' + (selectedItem.title || self.data.selectedInspectionItemId);
    var projectId = app.getV3State().project.id;
    return util.callAIAnalysis(filePath, config, currentArea.key, inspectionItemIds, deviceContext, {
      projectId: projectId, deviceNodeId: self.data.selectedDeviceId, inspectionItemId: self.data.selectedInspectionItemId
    })
      .then(function (analysisResult) {
        var isCurrentSchema = analysisResult.schemaVersion === 'ai-analysis-v2';
        var quality = analysisResult.quality || null;
        var qualityLabels = {
          clarity: { clear: '清晰', blurry: '模糊' },
          distance: { ok: '适中', too_far: '过远', too_close: '过近' },
          obstruction: { none: '无遮挡', partial: '部分遮挡', severe: '严重遮挡' },
          angle: { normal: '正常', abnormal: '异常' }
        };
        if (quality) {
          quality.clarityName = qualityLabels.clarity[quality.clarity] || '待判定';
          quality.distanceName = qualityLabels.distance[quality.distance] || '待判定';
          quality.obstructionName = qualityLabels.obstruction[quality.obstruction] || '待判定';
          quality.angleName = qualityLabels.angle[quality.angle] || '待判定';
        }
        var detectedKey = analysisResult.detectedArea || 'unknown';
        self.setData({
          qualityResult: quality,
          detectedAreaKey: detectedKey,
          detectedAreaName: util.getAreaName(detectedKey),
          areaConfidence: Math.round((Number(analysisResult.areaConfidence) || 0) * 100),
          areaDescription: analysisResult.areaDescription || ''
        });
        self._onAIResultReady(analysisResult, currentArea.key, currentArea.name);
        if (!isCurrentSchema) {
          setTimeout(function () {
            wx.showModal({
              title: '云端智能检测函数仍是旧版本',
              content: '当前云端返回：' + (analysisResult.schemaVersion || '未知版本') + ' / ' + (analysisResult.runtimeVersion || '无运行版本号') + '。本地目标版本为 ai-analysis-v2 / 2026.08.03-ai-v2.2。说明本次部署没有覆盖当前所选云环境中的 ai-analyze。',
              showCancel: false,
              confirmText: '知道了'
            });
          }, 350);
        }
      })
      .catch(function (err) { self._onAIError(err); });
  },

  // ========================================================
  // ===== AI Result Processing =====
  // ========================================================

  _onAIResultReady: function (result, areaKey, areaName) {
    if (this._aiTimer) {
      clearInterval(this._aiTimer);
      this._aiTimer = null;
    }

    // Normalize untrusted model output before it can enter the review UI.
    if (!result || typeof result !== 'object') {
      this._onAIError(new Error('智能检测返回结果为空或格式无效'));
      return;
    }
    if (!Array.isArray(result.defects)) result.defects = [];
    if (!Array.isArray(result.itemResults)) result.itemResults = [];
    var rawDefectCount = result.defects.length;
    var selectedItemId = this.data.selectedInspectionItemId;
    var allowedSeverities = { major: true, moderate: true, minor: true };
    var allowedStatuses = { normal: true, abnormal: true, uncertain: true };
    result.defects = result.defects.filter(function (d) {
      if (!d || typeof d !== 'object' || !d.name) return false;
      // Keep obvious defects reported outside the exact selected item. They
      // remain AI candidates and still require the inspector's confirmation.
      if (d.itemId && selectedItemId && d.itemId !== selectedItemId) {
        d.originalItemId = d.itemId;
        d.scopeAdjusted = true;
      }
      d.itemId = selectedItemId || d.itemId || '';
      if (!allowedSeverities[d.severity]) d.severity = 'moderate';
      if (d.confidence != null) d.confidence = Math.max(0, Math.min(1, Number(d.confidence) || 0));
      if (d.bbox) {
        ['x', 'y', 'w', 'h'].forEach(function (key) { d.bbox[key] = Math.max(0, Math.min(1, Number(d.bbox[key]) || 0)); });
      }
      return true;
    });
    result.itemResults = result.itemResults.filter(function (item) {
      return item && (!selectedItemId || item.itemId === selectedItemId);
    }).map(function (item) {
      if (!allowedStatuses[item.status]) item.status = 'uncertain';
      item.confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
      return item;
    });
    result.quality_score = Math.max(0, Math.min(100, Number(result.quality_score) || 0));

    // Match the system prompt: candidates at 60% or above enter manual review.
    // The previous 75% threshold caused many valid model candidates to vanish
    // before inspectors could see or confirm them.
    var CONFIDENCE_THRESHOLD = 0.60;
    var beforeConfidenceFilterCount = result.defects.length;
    result.defects = result.defects.filter(function (d) {
      if (d._userAdded) return true;  // keep user-added defects
      if (d.confidence == null) return false; // AI缺陷必须提供置信度
      return d.confidence >= CONFIDENCE_THRESHOLD;
    });
    console.info('[AI识别结果]', {
      schemaVersion: result.schemaVersion || 'legacy',
      modelCandidates: rawDefectCount,
      validCandidates: beforeConfidenceFilterCount,
      displayedCandidates: result.defects.length,
      selectedItemId: selectedItemId
    });

    // Re-number defects after filtering
    result.defects.forEach(function (d, i) { d.id = i + 1; });

    // Override low-confidence abnormal item results → mark as uncertain
    if (result.itemResults) {
      result.itemResults.forEach(function (item) {
        if (item.status === 'abnormal' && item.confidence != null && item.confidence < CONFIDENCE_THRESHOLD) {
          item.status = 'uncertain';
        }
      });
    }

    // Add typeName and severityName to each defect
    result.defects.forEach(function (d) {
      d.typeName = util.getTypeName(d.type);
      d.severityName = util.getSeverityCN(d.severity);
      // Precompute confidence display for WXML (can't use Math in templates)
      if (d._userAdded) {
        d.confidenceLabel = '人工';
      } else if (d.confidence != null) {
        d.confidenceLabel = Math.round((d.confidence || 0) * 100) + '%';
      } else {
        d.confidenceLabel = '';
      }
      d.lowConfidence = (d.confidence != null && d.confidence < 0.7 && !d._userAdded);
      d.reviewHint = d.scopeAdjusted ? '补充视觉发现，需人工确认归属' : (d.lowConfidence ? '低置信度候选，需人工确认' : '');
    });

    // Count severities
    var majorCount = 0, moderateCount = 0, minorCount = 0;
    result.defects.forEach(function (d) {
      if (d.severity === 'major') majorCount++;
      else if (d.severity === 'moderate') moderateCount++;
      else minorCount++;
    });

    // Process item results for display
    var itemResults = this._processItemResults(result);
    var normalItemCount = 0, abnormalItemCount = 0, uncertainItemCount = 0;
    itemResults.forEach(function (item) {
      if (item.status === 'normal') normalItemCount++;
      else if (item.status === 'abnormal') abnormalItemCount++;
      else uncertainItemCount++;
    });

    this.setData({
      aiLoading: false,
      aiProgress: 100,
      aiPhase: 'idle',
      aiResult: result,
      majorCount: majorCount,
      moderateCount: moderateCount,
      minorCount: minorCount,
      confirmedDefects: [],
      itemResults: itemResults,
      normalItemCount: normalItemCount,
      abnormalItemCount: abnormalItemCount,
      uncertainItemCount: uncertainItemCount,
      inspectionCommitted: false,
      committedRecordId: '', rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: ''
    });

    // Increment global counter
    app.globalData.aiAnalysisCount++;

    // AI结果只进入页面草稿；人工复核提交前不写历史、缺陷台账或巡检完成记录。

    // The result layout owns the canvas, so initialize it after the result view is rendered.
    var self = this;
    setTimeout(function () {
      self._initCanvas(self.data.tempFilePath);
    }, 220);
    setTimeout(function () {
      self._drawBboxOverlay();
    }, 780);
  },

  _commitInspectionResult: function (result, areaKey, areaName) {
    if (this.data.inspectionCommitted) return true;
    if (app.globalData.aiConfig.demoMode) {
      wx.showModal({
        title: '演示结果不可入库',
        content: '当前为演示模式，结果仅用于体验界面，不会写入正式检查记录和缺陷整改台账。',
        showCancel: false,
        confirmText: '知道了'
      });
      return false;
    }
    var records = app.globalData.historyRecords;
    var areaInfo = data.checklistData[areaKey];
    var selectedDeviceId = this.data.selectedDeviceId;
    var selectedPositionCode = this.data.positionCode || '未填写具体位置';

      var record = {
      id: Date.now(),
      type: 'inspection',
      area: areaKey,
      areaName: areaName,
      areaIcon: areaInfo ? areaInfo.icon : '',
      projectId: app.getV3State().project.id,
      deviceId: app.getV3State().project.deviceId || '',
      deviceNodeId: this.data.selectedDeviceId,
      inspectionItemId: this.data.selectedInspectionItemId,
      inspectionMethod: this.data.inspectionMethodKey,
      inspectionMethodName: this.data.inspectionMethodName,
      positionCode: this.data.positionCode || '未填写具体位置',
      qualityScore: result.quality_score || 0,
      majorCount: this.data.majorCount,
      moderateCount: this.data.moderateCount,
      minorCount: this.data.minorCount,
      totalDefects: result.defects ? result.defects.length : 0,
      defects: (result.defects || []).map(function (d) {
        return {
          id: d.id,
          name: d.name,
          type: d.type,
          severity: d.severity,
          description: d.description || '',
          suggestion: d.suggestion || '',
          standard: d.standard || '',
          confidence: d.confidence || 0,
          _userAdded: d._userAdded || false,
          itemId: d.itemId || '',
          bbox: d.bbox || null,
          location_hint: d.location_hint || '',
          deviceNodeId: selectedDeviceId,
          positionCode: selectedPositionCode,
          status: 'pending'
        };
      }),
      image: this.data.tempFilePath || '',
      reviewStatus: 'confirmed',
      reviewStatusName: '人工已复核',
      time: util.formatDateTime(),
      timestamp: Date.now()
    };

    records.unshift(record);
    this.setData({ inspectionCommitted: true, committedRecordId: record.id });

    // Keep max 200 records
    if (records.length > 200) {
      records = records.slice(0, 200);
      app.globalData.historyRecords = records;
    }

    app.saveHistory();

    // V3.0: materialize AI defects into the spatial defect ledger.
    var self = this;
    var deviceNode = v3Data.getNodeById(this.data.selectedDeviceId);
    var fieldContext = v3Data.getFieldContext(this.data.selectedDeviceId);
    var areaSource = v3Data.STANDARD_SOURCES[areaKey] || {};
    var spatialDefects = [];
    (result.defects || []).forEach(function (d) {
      var bbox = d.bbox || { x: 0.5, y: 0.5, w: 0, h: 0 };
      var spatialDefect = app.addSpatialDefect({
        deviceNodeId: self.data.selectedDeviceId,
        fieldId: fieldContext.fieldId,
        chamber: fieldContext.chamber,
        fieldNo: fieldContext.fieldNo,
        systemId: self.data.selectedDeviceId,
        deviceName: fieldContext.deviceName || (deviceNode ? deviceNode.name : areaName),
        systemName: deviceNode ? deviceNode.name : areaName,
        positionCode: self.data.positionCode || d.location_hint || '现场待复核',
        name: d.name,
        type: d.type,
        severity: d.severity,
        level: d.severity === 'major' ? 'Ⅱ级' : d.severity === 'moderate' ? 'Ⅲ级' : 'Ⅳ级',
        confidence: d.confidence || 0,
        description: d.description || '', suggestion: d.suggestion || '', standard: d.standard || areaSource.document || '',
        sourceDocument: areaSource.document || '', constructionStageId: (deviceNode && deviceNode.stageId) || areaSource.stageId || '',
        inspectionItemId: d.itemId || self.data.selectedInspectionItemId,
        image: self.data.tempFilePath || '', imageFileID: '', imageBBox: bbox,
        modelMarker: { regionId: fieldContext.fieldId || self.data.selectedDeviceId, x: Math.round((bbox.x + bbox.w / 2) * 100), y: Math.round((bbox.y + bbox.h / 2) * 100) },
        inspector: d._userAdded ? '人工补录·人工复核' : '智能检测·人工复核', deadline: ''
      });
      d._v3DefectId = spatialDefect.id;
      spatialDefects.push(spatialDefect);
    });
    this._syncLatestHistoryFromResult();
    var v3State = app.getV3State();
    var inspection = {
      id: 'INSP-AI-' + Date.now(), name: (deviceNode ? deviceNode.name : areaName) + ' 智能安装质量检查',
      projectId: v3State.project.id,
      deviceId: v3State.project.deviceId || '',
      stageId: (deviceNode && deviceNode.stageId) || areaSource.stageId || '', sourceDocument: areaSource.document || '',
      deviceNodeId: this.data.selectedDeviceId, inspectionItemId: this.data.selectedInspectionItemId,
      inspectionMethod: this.data.inspectionMethodKey, inspector: '智能检测·人工复核', photoCount: 1,
      itemCount: (result.itemResults || []).length, defectCount: (result.defects || []).length,
      status: 'completed', reviewStatus: 'confirmed', time: util.formatDateTime()
    };
    v3State.inspections.unshift(inspection);
    app.saveV3State();
    if (spatialDefects.length) {
      var rectificationOrder = app.createOpenRectificationOrder(record, inspection, spatialDefects, this.data.tempFilePath || '');
      this.setData({
        rectificationOrderId: rectificationOrder.id,
        rectificationOrderNo: rectificationOrder.id,
        rectificationStatusName: rectificationOrder.statusName,
        rectificationShareToken: rectificationOrder.shareToken
      });
    }
    app.syncInspectionToCloud(record, inspection, spatialDefects);
    return true;
  },

  _processItemResults: function (result) {
    var areaKey = this._getCurrentArea().key;
    var areaData = data.standardsDetail[areaKey];
    if (!areaData || !areaData.items) return [];

    var aiItems = result.itemResults || [];
    var items = [];

    for (var i = 0; i < aiItems.length; i++) {
      var aiItem = aiItems[i];
      // Look up title from standardsDetail
      var title = aiItem.itemId;
      for (var j = 0; j < areaData.items.length; j++) {
        if (areaData.items[j].id === aiItem.itemId) {
          title = areaData.items[j].title;
          break;
        }
      }

      // Map status to icon and text
      var statusIcon = '?';
      var statusText = '未知';
      if (aiItem.status === 'normal') {
        statusIcon = '\u2705';
        statusText = '正常';
      } else if (aiItem.status === 'abnormal') {
        statusIcon = '\u274C';
        statusText = '异常';
      } else if (aiItem.status === 'uncertain') {
        statusIcon = '\u2753';
        statusText = '无法判断';
      }

      var confidencePercent = Math.round((aiItem.confidence || 0) * 100);

      items.push({
        itemId: aiItem.itemId,
        title: title,
        status: aiItem.status,
        confidence: aiItem.confidence,
        reason: aiItem.reason || '',
        statusIcon: statusIcon,
        statusText: statusText,
        confidencePercent: confidencePercent,
        expanded: aiItem.status === 'abnormal',
        defectId: aiItem.defectId || null
      });
    }

    return items;
  },

  _onAIError: function (err) {
    var self = this;
    if (this._aiTimer) {
      clearInterval(this._aiTimer);
      this._aiTimer = null;
    }
    this.setData({
      aiLoading: false,
      aiProgress: 0,
      aiPhase: 'idle'
    });
    var message = (err && err.message) || '未知错误';
    var isTimeoutError = /超时|timeout|timed out|ECONNABORTED/i.test(message);
    if (isTimeoutError) {
      wx.showModal({
        title: '智能分析超时',
        content: message + '\n\n系统已自动结束本次等待。请在云开发控制台查看 ai-analyze 日志后重试。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    var isConfigurationError = /缺少 API 地址或 API Key|FunctionName parameter could not be found|FUNCTION_NOT_FOUND/i.test(message);
    if (isConfigurationError) {
      wx.showModal({
        title: '智能服务尚未配置',
        content: 'API Key需要配置在 ai-analyze 云函数环境变量中。你可以先切换到演示模式继续体验完整检测流程。',
        cancelText: '暂不切换',
        confirmText: '演示模式',
        success: function (res) {
          if (!res.confirm) return;
          app.globalData.aiConfig.demoMode = true;
          app.saveConfig();
          self.setData({ isDemoMode: true });
          wx.showToast({ title: '已开启演示模式', icon: 'success' });
          setTimeout(function () { self.runAIAnalysis(); }, 350);
        }
      });
      return;
    }
    wx.showModal({
      title: '智能分析失败',
      content: message + '\n\n请检查网络、云函数部署和模型配置后重试。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  reAnalyze: function () {
    this.setData({
      aiResult: null,
      majorCount: 0,
      moderateCount: 0,
      minorCount: 0,
      itemResults: [],
      activeDefectId: -1,
      aiPhase: 'idle',
      inspectionCommitted: false,
      committedRecordId: '', rectificationOrderId: '', rectificationOrderNo: '', rectificationStatusName: '', rectificationShareToken: ''
    });
  },

  // ========================================================
  // ===== Bbox Overlay =====
  // ========================================================

  _drawBboxOverlay: function () {
    var self = this;
    if (!self._ctx || !self._canvas) return;
    if (!self.data.showBbox) return;
    if (!self.data.aiResult || !self.data.aiResult.defects) return;

    var ctx = self._ctx;
    var w = self._canvasW;
    var h = self._canvasH;
    var defects = self.data.aiResult.defects;
    var activeId = self.data.activeDefectId;

    var severityColors = {
      major: '#ff3b5c',
      moderate: '#fbbf24',
      minor: '#00d4ff'
    };

    for (var i = 0; i < defects.length; i++) {
      var d = defects[i];
      if (!d.bbox) continue;

      var bx = d.bbox.x * w;
      var by = d.bbox.y * h;
      var bw = d.bbox.w * w;
      var bh = d.bbox.h * h;
      var color = severityColors[d.severity] || '#ff3b5c';
      var isActive = (d.id === activeId);

      ctx.save();

      // Draw rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 4 : 2;
      ctx.setLineDash(isActive ? [] : [6, 3]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);

      // Draw numbered label background
      var label = String(d.id);
      var labelW = 22;
      var labelH = 18;
      var labelX = bx;
      var labelY = by - labelH;
      if (labelY < 0) labelY = by;

      ctx.fillStyle = color;
      ctx.fillRect(labelX, labelY, labelW, labelH);

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + labelW / 2, labelY + labelH / 2);

      // If active, draw thicker highlight border
      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
      }

      ctx.restore();
    }
  },

  highlightDefect: function (e) {
    var id = e.currentTarget.dataset.id;
    if (typeof id === 'undefined') return;
    var newId = (this.data.activeDefectId === id) ? -1 : id;
    this.setData({ activeDefectId: newId });
    this._redrawCanvas();
  },

  toggleBbox: function () {
    this.setData({ showBbox: !this.data.showBbox });
    this._redrawCanvas();
  },

  // ========================================================
  // ===== Item Result Cards =====
  // ========================================================

  toggleItemDetail: function (e) {
    var idx = e.currentTarget.dataset.index;
    if (typeof idx === 'undefined') return;
    var updateData = {};
    updateData['itemResults[' + idx + '].expanded'] = !this.data.itemResults[idx].expanded;
    this.setData(updateData);
  },

  // ========================================================
  // ===== Result Actions =====
  // ========================================================

  adoptResults: function () {
    var result = this.data.aiResult;
    if (!result) return;
    var area = this._getCurrentArea();
    if (!this._commitInspectionResult(result, area.key, area.name)) return;
    wx.showToast({
      title: result.defects.length ? ('已提交 ' + result.defects.length + ' 条缺陷') : '已提交无缺陷检查',
      icon: 'success',
      duration: 2000
    });
  },

  openRectification: function () {
    if (!this.data.rectificationOrderId) return;
    wx.navigateTo({ url: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(this.data.rectificationOrderId) + '&from=creator' });
  },

  openRectificationShare: function () {
    if (!this.data.rectificationOrderId) return;
    wx.navigateTo({
      url: '/pages/rectification-share/rectification-share?id=' + encodeURIComponent(this.data.rectificationOrderId)
    });
  },

  onShareAppMessage: function () {
    return require('../../utils/share.js').home();
  },

  editResults: function () {
    var result = this.data.aiResult;
    if (!result || !result.defects || result.defects.length === 0) {
      wx.showToast({ title: '没有结果可编辑', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '复核智能检测草稿',
      content: '请逐条使用“编辑”修正描述和等级，使用“误报”删除错误结果，必要时补充漏检。完成后点击“确认并提交”。',
      showCancel: false,
      confirmText: '开始复核'
    });
  },

  // ========================================================
  // ===== Defect Edit / False Positive / Missed Defect =====
  // ========================================================

  editDefect: function (e) {
    var idx = e.currentTarget.dataset.index;
    if (typeof idx === 'undefined') return;
    var result = this.data.aiResult;
    if (!result || !result.defects || !result.defects[idx]) return;

    var defect = result.defects[idx];
    this.setData({
      editingDefectIndex: idx,
      showEditDefectModal: true,
      editDefectForm: {
        severity: defect.severity || 'moderate',
        description: defect.description || '',
        suggestion: defect.suggestion || ''
      }
    });
  },

  onEditDefectInput: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var updateData = {};
    updateData['editDefectForm.' + field] = e.detail.value;
    this.setData(updateData);
  },

  saveEditDefect: function () {
    var idx = this.data.editingDefectIndex;
    if (idx < 0) return;
    var result = this.data.aiResult;
    if (!result || !result.defects || !result.defects[idx]) return;

    var form = this.data.editDefectForm;
    var defect = result.defects[idx];

    // Apply edits
    if (form.severity) defect.severity = form.severity;
    if (form.description) defect.description = form.description;
    if (form.suggestion) defect.suggestion = form.suggestion;

    // Update severityName
    defect.severityName = util.getSeverityCN(defect.severity);

    // Recount severities
    var majorCount = 0, moderateCount = 0, minorCount = 0;
    result.defects.forEach(function (d) {
      if (d.severity === 'major') majorCount++;
      else if (d.severity === 'moderate') moderateCount++;
      else minorCount++;
    });

    this.setData({
      aiResult: result,
      majorCount: majorCount,
      moderateCount: moderateCount,
      minorCount: minorCount,
      showEditDefectModal: false,
      editingDefectIndex: -1
    });

    if (defect._v3DefectId) {
      app.updateDefectStatus(defect._v3DefectId, 'pending', {
        severity: defect.severity,
        level: defect.severity === 'major' ? 'Ⅱ级' : defect.severity === 'moderate' ? 'Ⅲ级' : 'Ⅳ级',
        description: defect.description,
        suggestion: defect.suggestion
      });
    }
    this._syncLatestHistoryFromResult();

    wx.showToast({ title: '已更新', icon: 'success', duration: 800 });
  },

  onEditSeverityChange: function (e) {
    var idx = parseInt(e.detail.value);
    var severityMap = ['major', 'moderate', 'minor'];
    this.setData({ 'editDefectForm.severity': severityMap[idx] || 'moderate' });
  },

  onMissedSeverityChange: function (e) {
    var idx = parseInt(e.detail.value);
    var severityMap = ['major', 'moderate', 'minor'];
    this.setData({ 'missedDefectForm.severity': severityMap[idx] || 'moderate' });
  },

  cancelEditDefect: function () {
    this.setData({
      showEditDefectModal: false,
      editingDefectIndex: -1
    });
  },

  markAsFalsePositive: function (e) {
    var idx = e.currentTarget.dataset.index;
    if (typeof idx === 'undefined') return;
    var self = this;
    var result = this.data.aiResult;
    if (!result || !result.defects || !result.defects[idx]) return;

    if (this.data.isDemoMode) {
      this._removeDefectByIndex(idx);
      wx.showToast({ title: '演示误报已移除', icon: 'none', duration: 1200 });
      return;
    }

    var defect = result.defects[idx];
    var area = this._getCurrentArea();
    var filePath = this.data.tempFilePath;

    wx.showLoading({ title: '正在标记...' });

    var saveFalsePositive = function (fileID) {
      try {
        var db = wx.cloud.database();
        db.collection('false-positives').add({
          data: {
            area: area.key,
            areaName: area.name,
            type: defect.type || 'other',
            name: defect.name || '',
            severity: defect.severity || 'minor',
            description: defect.description || '',
            standard: defect.standard || '',
            imageFileID: fileID || '',
            source: 'user_rejected',
            createTime: db.serverDate()
          },
          success: function () {
            wx.hideLoading();
            wx.showToast({ title: '已标记为误报', icon: 'success', duration: 1500 });
            // Remove defect from result (same as rejectDefect)
            self._removeDefectByIndex(idx);
          },
          fail: function (err) {
            wx.hideLoading();
            console.error('保存误报记录失败:', err);
            // Still remove from display even if cloud save fails
            wx.showToast({ title: '已标记为误报', icon: 'success', duration: 1500 });
            self._removeDefectByIndex(idx);
          }
        });
      } catch (ex) {
        wx.hideLoading();
        console.error('云数据库不可用:', ex);
        wx.showToast({ title: '已标记为误报', icon: 'success', duration: 1500 });
        self._removeDefectByIndex(idx);
      }
    };

    // Upload image first if we have a local file path
    if (filePath && filePath.indexOf('cloud://') !== 0) {
      var cloudPath = 'false-positives/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: function (res) {
          saveFalsePositive(res.fileID);
        },
        fail: function () {
          saveFalsePositive('');
        }
      });
    } else {
      saveFalsePositive(filePath || '');
    }
  },

  _removeDefectByIndex: function (idx) {
    var result = this.data.aiResult;
    if (!result || !result.defects) return;

    var removedDefect = result.defects[idx];
    var defects = result.defects.slice();
    defects.splice(idx, 1);

    // Re-number
    defects.forEach(function (d, i) { d.id = i + 1; });

    // Recount severities
    var majorCount = 0, moderateCount = 0, minorCount = 0;
    defects.forEach(function (d) {
      if (d.severity === 'major') majorCount++;
      else if (d.severity === 'moderate') moderateCount++;
      else minorCount++;
    });

    // Remove from confirmed tracking
    var confirmed = this.data.confirmedDefects.filter(function (i) { return i !== idx; });
    confirmed = confirmed.map(function (i) { return i > idx ? i - 1 : i; });

    result.defects = defects;
    this.setData({
      aiResult: result,
      majorCount: majorCount,
      moderateCount: moderateCount,
      minorCount: minorCount,
      confirmedDefects: confirmed,
      activeDefectId: -1
    });

    // Redraw canvas without the removed bbox
    this._redrawCanvas();
    if (removedDefect && removedDefect._v3DefectId) app.removeSpatialDefect(removedDefect._v3DefectId);
    this._syncLatestHistoryFromResult();
  },

  _syncLatestHistoryFromResult: function () {
    var result = this.data.aiResult;
    var records = app.globalData.historyRecords || [];
    if (!result || !this.data.inspectionCommitted || !this.data.committedRecordId) return;
    var target = null;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === this.data.committedRecordId && records[i].type === 'inspection') { target = records[i]; break; }
    }
    if (!target) return;
    target.defects = (result.defects || []).map(function (d) {
      return {
        id: d.id, name: d.name, type: d.type, severity: d.severity,
        description: d.description || '', suggestion: d.suggestion || '', standard: d.standard || '',
        confidence: d.confidence || 0, itemId: d.itemId || '', bbox: d.bbox || null,
        location_hint: d.location_hint || '', _userAdded: !!d._userAdded,
        _v3DefectId: d._v3DefectId || ''
      };
    });
    target.totalDefects = target.defects.length;
    target.majorCount = this.data.majorCount;
    target.moderateCount = this.data.moderateCount;
    target.minorCount = this.data.minorCount;
    app.saveHistory();
  },

  showAddMissedDefect: function () {
    this.setData({
      showMissedDefectModal: true,
      missedDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
    this._syncLatestHistoryFromResult();
  },

  onMissedDefectInput: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var updateData = {};
    updateData['missedDefectForm.' + field] = e.detail.value;
    this.setData(updateData);
  },

  confirmMissedDefect: function () {
    var self = this;
    var form = this.data.missedDefectForm;
    if (!form.name) {
      wx.showToast({ title: '请填写缺陷名称', icon: 'none' });
      return;
    }

    var area = this._getCurrentArea();
    var result = this.data.aiResult;

    // Build the new defect
    var newId = 1;
    if (result && result.defects && result.defects.length > 0) {
      newId = result.defects.length + 1;
    }

    var newDefect = {
      id: newId,
      itemId: '',
      type: 'other',
      name: form.name,
      severity: form.severity || 'moderate',
      typeName: '其他',
      severityName: util.getSeverityCN(form.severity || 'moderate'),
      confidence: 1.0,
      description: form.description || '',
      suggestion: form.suggestion || '',
      standard: '',
      location_hint: '',
      _userAdded: true
    };

    var deviceNode = v3Data.getNodeById(this.data.selectedDeviceId);
    var missedFieldContext = v3Data.getFieldContext(this.data.selectedDeviceId);
    var missedSource = v3Data.STANDARD_SOURCES[area.key] || {};
    // 草稿阶段只更新页面；已经正式提交的检查才同步新增空间缺陷。
    if (this.data.inspectionCommitted && !this.data.isDemoMode) {
      var spatialMissed = app.addSpatialDefect({
        deviceNodeId: this.data.selectedDeviceId,
        systemId: this.data.selectedDeviceId,
        fieldId: missedFieldContext.fieldId,
        chamber: missedFieldContext.chamber,
        fieldNo: missedFieldContext.fieldNo,
        deviceName: missedFieldContext.deviceName || (deviceNode ? deviceNode.name : area.name),
        systemName: area.name,
        positionCode: this.data.positionCode || '现场待复核',
        name: form.name,
        type: 'other', severity: form.severity || 'moderate',
        level: form.severity === 'major' ? 'Ⅱ级' : form.severity === 'minor' ? 'Ⅳ级' : 'Ⅲ级',
        confidence: 1, description: form.description || '', suggestion: form.suggestion || '',
        sourceDocument: missedSource.document || '', constructionStageId: (deviceNode && deviceNode.stageId) || missedSource.stageId || '',
        inspectionItemId: this.data.selectedInspectionItemId,
        image: this.data.tempFilePath || '', modelMarker: null, inspector: '人工补录'
      });
      newDefect._v3DefectId = spatialMissed.id;
    }

    // Add to cloud database (missed-defects collection)
    if (!this.data.isDemoMode) try {
      var db = wx.cloud.database();
      db.collection('missed-defects').add({
        data: {
          area: area.key,
          areaName: area.name,
          type: 'user_added',
          name: form.name,
          severity: form.severity || 'moderate',
          description: form.description || '',
          suggestion: form.suggestion || '',
          createTime: db.serverDate()
        },
        success: function () {},
        fail: function (err) {
          console.error('保存漏检缺陷失败:', err);
        }
      });
    } catch (ex) {
      console.error('云数据库不可用:', ex);
    }

    // Add to aiResult.defects for display
    if (!result) {
      result = { defects: [], overall_assessment: '', quality_score: 0, safety_notes: '' };
    }
    if (!result.defects) result.defects = [];
    result.defects.push(newDefect);

    // Recount severities
    var majorCount = 0, moderateCount = 0, minorCount = 0;
    result.defects.forEach(function (d) {
      if (d.severity === 'major') majorCount++;
      else if (d.severity === 'moderate') moderateCount++;
      else minorCount++;
    });

    this.setData({
      aiResult: result,
      majorCount: majorCount,
      moderateCount: moderateCount,
      minorCount: minorCount,
      showMissedDefectModal: false,
      missedDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
    this._syncLatestHistoryFromResult();

    wx.showToast({ title: '已添加漏检缺陷', icon: 'success', duration: 1500 });
  },

  cancelMissedDefect: function () {
    this.setData({
      showMissedDefectModal: false,
      missedDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  // ========================================================
  // ===== Sample Learning =====
  // ========================================================

  confirmDefect: function (e) {
    var idx = e.currentTarget.dataset.index;
    var self = this;
    var confirmed = this.data.confirmedDefects.slice();
    if (confirmed.indexOf(idx) !== -1) return; // already confirmed

    confirmed.push(idx);
    this.setData({ confirmedDefects: confirmed });

    if (this.data.isDemoMode) {
      wx.showToast({ title: '演示确认（不入样本库）', icon: 'none', duration: 1200 });
      return;
    }

    wx.showToast({ title: '已确认为样本', icon: 'success', duration: 800 });

    // Upload image and save to sample DB in background
    var defect = this.data.aiResult.defects[idx];
    var area = this._getCurrentArea();
    this._saveToSampleDB(defect, this.data.tempFilePath, area);
  },

  rejectDefect: function (e) {
    var idx = e.currentTarget.dataset.index;
    this._removeDefectByIndex(idx);
  },

  confirmAndLearn: function () {
    var self = this;
    var result = this.data.aiResult;
    if (!result) return;

    var area = this._getCurrentArea();
    if (!this._commitInspectionResult(result, area.key, area.name)) return;
    if (!result.defects || result.defects.length === 0) {
      wx.showToast({ title: '无缺陷检查已提交', icon: 'success' });
      return;
    }
    var pendingSamples = result.defects.filter(function (defect, index) {
      return self.data.confirmedDefects.indexOf(index) === -1;
    });
    if (!pendingSamples.length) {
      wx.showToast({ title: '正式记录已提交，样本已确认', icon: 'success' });
      return;
    }
    var filePath = this.data.tempFilePath;

    // 正式记录已由人工提交，现在将确认结果补充到样本库。
    wx.showLoading({ title: '正在保存到样本库...' });

    var cloudPath = 'defect-samples/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (uploadRes) {
        var fileID = uploadRes.fileID;
        var saved = 0;
        var total = pendingSamples.length;

        pendingSamples.forEach(function (defect) {
          self._saveToSampleDB(defect, fileID, area, function () {
            saved++;
            if (saved >= total) {
              wx.hideLoading();
              wx.showToast({
                title: '已保存 ' + total + ' 条到样本库',
                icon: 'success',
                duration: 2000
              });
            }
          });
        });

        // Mark all as confirmed in UI
        var allIndices = [];
        for (var i = 0; i < result.defects.length; i++) allIndices.push(i);
        self.setData({ confirmedDefects: allIndices });
      },
      fail: function () {
        wx.hideLoading();
        // Image upload failed, still save to local history
        wx.showToast({
          title: '已保存到本地，样本库上传失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  _saveToSampleDB: function (defect, imagePathOrFileID, area, callback) {
    var areaKey = area.key;
    var areaName = area.name;
    var severityName = util.getSeverityName(defect.severity);

    var saveRecord = function (fileID) {
      try {
        var db = wx.cloud.database();
        db.collection('defect-samples').add({
          data: {
            area: areaKey,
            areaName: areaName,
            type: defect.type || 'other',
            name: defect.name || '',
            severity: defect.severity || 'minor',
            severityName: severityName,
            description: defect.description || '',
            suggestion: defect.suggestion || '',
            standard: defect.standard || '',
            imageFileID: fileID || '',
            source: 'ai_confirmed',
            createTime: db.serverDate()
          },
          success: function () {
            if (callback) callback();
          },
          fail: function (err) {
            console.error('保存样本失败:', err);
            if (callback) callback();
          }
        });
      } catch (e) {
        console.error('云数据库不可用:', e);
        if (callback) callback();
      }
    };

    // If imagePathOrFileID is a cloud fileID (starts with cloud://), use directly
    if (typeof imagePathOrFileID === 'string' && imagePathOrFileID.indexOf('cloud://') === 0) {
      saveRecord(imagePathOrFileID);
    } else if (typeof imagePathOrFileID === 'string' && imagePathOrFileID.length > 0) {
      // It's a local file path, upload first
      var cloudPath = 'defect-samples/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePathOrFileID,
        success: function (res) {
          saveRecord(res.fileID);
        },
        fail: function () {
          saveRecord(''); // save without image
        }
      });
    } else {
      saveRecord('');
    }
  },

  // ========================================================
  // ===== Checklist =====
  // ========================================================

  _initChecklist: function (areaKey) {
    var areaData = data.checklistData[areaKey];
    if (!areaData) return;

    this.setData({
      checkArea: areaKey,
      checkItems: areaData.items,
      checklistTip: areaData.tip
    });

    this._refreshChecklistState();
  },

  switchCheckArea: function (e) {
    var key = e.currentTarget.dataset.key;
    this._initChecklist(key);
  },

  _refreshChecklistState: function () {
    var areaKey = this.data.checkArea;
    var areaData = data.checklistData[areaKey];
    if (!areaData) return;

    var states = app.globalData.checkStates;
    var passCount = 0, failCount = 0, warnCount = 0;

    var itemsWithState = areaData.items.map(function (item) {
      var key = areaKey + '_' + item.id;
      var state = states[key] || '';
      var note = states[key + '_note'] || '';

      if (state === 'pass') passCount++;
      else if (state === 'fail') failCount++;
      else if (state === 'warn') warnCount++;

      return {
        id: item.id,
        title: item.title,
        desc: item.desc,
        standard: item.standard,
        _state: state,
        _note: note
      };
    });

    this.setData({
      checkItemsWithState: itemsWithState,
      checkPassCount: passCount,
      checkFailCount: failCount,
      checkWarnCount: warnCount
    });
  },

  setCheckState: function (e) {
    var ds = e.currentTarget.dataset;
    var area = ds.area;
    var id = ds.id;
    var state = ds.state;
    var key = area + '_' + id;

    // Toggle: if same state, clear it
    var currentState = app.globalData.checkStates[key];
    if (currentState === state) {
      delete app.globalData.checkStates[key];
    } else {
      app.globalData.checkStates[key] = state;
    }

    this._refreshChecklistState();
  },

  onCheckNoteInput: function (e) {
    var ds = e.currentTarget.dataset;
    var area = ds.area;
    var id = ds.id;
    var noteKey = area + '_' + id + '_note';

    app.globalData.checkStates[noteKey] = e.detail.value;
  },

  openFeatureGuide: function () {
    wx.navigateTo({ url: '/pages/feature-guide/feature-guide?feature=smartInspection' });
  },

  resetChecklist: function () {
    var self = this;
    wx.showModal({
      title: '确认重置',
      content: '将清除当前部位的所有检查状态，是否继续？',
      success: function (res) {
        if (res.confirm) {
          var areaKey = self.data.checkArea;
          var states = app.globalData.checkStates;
          var areaData = data.checklistData[areaKey];
          if (areaData) {
            areaData.items.forEach(function (item) {
              var key = areaKey + '_' + item.id;
              delete states[key];
              delete states[key + '_note'];
            });
          }
          app.saveCheckStates();
          self._refreshChecklistState();
          wx.showToast({ title: '已重置', icon: 'success' });
        }
      }
    });
  },

  saveChecklist: function () {
    app.saveCheckStates();

    var total = this.data.checkItemsWithState.length;
    var checked = this.data.checkPassCount + this.data.checkFailCount + this.data.checkWarnCount;

    wx.showToast({
      title: '已保存 (' + checked + '/' + total + ')',
      icon: 'success',
      duration: 2000
    });
  }
});
