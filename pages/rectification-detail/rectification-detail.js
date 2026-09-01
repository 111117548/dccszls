var app = getApp();
var util = require('../../utils/util.js');

function getPhotoUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  return value.tempFileURL || value.temp_file_url || value.tempUrl || value.download_url || value.preview_url || value.url || value.fileID || value.fileId || value.path || value.localPath || '';
}

function collectPhotos() {
  var result = [];
  function append(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    var url = getPhotoUrl(value);
    if (url && result.indexOf(url) < 0) result.push(url);
    if (typeof value === 'object') {
      ['urls', 'images', 'attachments', 'files', 'fileList', 'value'].forEach(function (key) {
        if (value[key] && value[key] !== value) append(value[key]);
      });
    }
  }
  Array.prototype.slice.call(arguments).forEach(append);
  return result;
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    return normalizeText(value.text || value.name || value.label || value.title || value.value || '');
  }
  return '';
}

function firstText() {
  for (var i = 0; i < arguments.length; i++) {
    var text = normalizeText(arguments[i]);
    if (text) return text;
  }
  return '';
}

function joinUnique(values) {
  var result = [];
  (values || []).forEach(function (value) {
    var text = normalizeText(value);
    if (text && result.indexOf(text) < 0) result.push(text);
  });
  return result.join(' · ');
}

function formatDeadline(value) {
  if (!value) return '未设置';
  return String(value)
    .replace('T', ' ')
    .replace(/(\d{1,2}:\d{2}):\d{2}(?:\.\d+)?(?:Z)?$/, '$1');
}

function uploadErrorText(error) {
  var values = [error && error.errMsg, error && error.message, error && error.code];
  var unique = [];
  values.forEach(function (value) {
    var text = String(value || '').trim();
    if (text && unique.indexOf(text) < 0) unique.push(text);
  });
  return unique.join(' · ');
}

function isTransientUploadError(error) {
  return /timeout|timed out|network|tls|socket|connection|econn|epipe|hang up|uploadfile:fail undefined/i.test(uploadErrorText(error));
}

function uploadEvidencePhoto(filePath, cloudPath, attempt) {
  attempt = Number(attempt || 1);
  return new Promise(function (resolve, reject) {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (res) {
        if (res && res.fileID) resolve(res.fileID);
        else reject(new Error('云存储未返回文件 ID'));
      },
      fail: reject
    });
  }).catch(function (error) {
    console.error('[rectification-evidence] upload failed', {
      attempt: attempt,
      cloudPath: cloudPath,
      error: error
    });
    if (isTransientUploadError(error) && attempt < 3) {
      return new Promise(function (resolve) {
        setTimeout(resolve, attempt * 1000);
      }).then(function () {
        return uploadEvidencePhoto(filePath, cloudPath, attempt + 1);
      });
    }
    var wrapped = new Error(isTransientUploadError(error)
      ? '网络连接中断，整改照片上传失败，请切换网络后重试。'
      : '整改照片上传失败，请稍后重试。');
    wrapped.code = 'EVIDENCE_UPLOAD_FAILED';
    wrapped.originalError = error;
    throw wrapped;
  });
}

Page({
  data: {
    loading: true, errorMessage: '', order: null,
    orderId: '', projectId: '', shareToken: '', fromShare: false, isCreatorView: false,
    localPhotos: [], measurement: '', rectificationNote: '', closureError: '', submitting: false,
    displayStatus: '待整改', isClosed: false, isReview: false, isExternalClosing: false, canOperate: false,
    canManageProject: false,
    reviewNote: '', reviewing: false,
    reminderConfig: {}, reminderState: {}, reminderLoading: false,
    reminderConfigured: false, reminderEnabled: false, reminderNeedsRenewal: false,
    reminderModeName: '', reminderStatusText: '', reminderRecipientText: '', reminderSendTime: '09:00'
  },

  onLoad: function (options) {
    var orderId = decodeURIComponent(options.id || '');
    var projectId = decodeURIComponent(options.projectId || '');
    var shareToken = decodeURIComponent(options.token || '');
    var fromShare = options.from === 'share';
    this.setData({ orderId: orderId, projectId: projectId, shareToken: shareToken, fromShare: fromShare, isCreatorView: !fromShare });
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    this.loadOrder();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadOrder().then(function () { wx.stopPullDownRefresh(); }).catch(function () { wx.stopPullDownRefresh(); });
  },

  loadOrder: function () {
    var self = this;
    var local = app.getRectificationOrder(this.data.orderId);
    var projectId = this.data.projectId || (local && local.projectId) || app.getV3State().project.id;
    var shareToken = this.data.shareToken || (local && local.shareToken) || '';
    this.setData({ loading: true, errorMessage: '', projectId: projectId, shareToken: shareToken });

    if (shareToken) {
      return app.loadOpenRectification(projectId, this.data.orderId, shareToken).then(function (order) {
        self._applyOrder(order);
        return order;
      }).catch(function (err) {
        if (local && local.shareToken === shareToken) {
          self._applyOrder(local);
          wx.showToast({ title: '当前显示本地记录', icon: 'none' });
          return local;
        }
        self.setData({ loading: false, errorMessage: err.message || '整改协作链接无法打开' });
        throw err;
      });
    }
    if (local) {
      this._applyOrder(local);
      return Promise.resolve(local);
    }
    this.setData({ loading: false, errorMessage: '未找到整改单，请从原分享卡片重新打开。' });
    return Promise.reject(new Error('整改单不存在'));
  },

  _applyOrder: function (order) {
    if (!order) return;
    var decorated = Object.assign({}, order);
    var feishuSnapshot = order.feishuSnapshot || {};
    var snapshotItem = feishuSnapshot.item || {};
    decorated.items = (order.items || []).map(function (item, index) {
      return Object.assign({}, item, { indexNo: String(index + 1).padStart(2, '0'), severityName: item.level || (item.severity === 'major' ? 'Ⅱ级' : item.severity === 'minor' ? 'Ⅳ级' : 'Ⅲ级') });
    });
    decorated.timeline = order.timeline || [];
    decorated.beforePhotos = collectPhotos(
      order.sourceImageFileID,
      order.sourceImageLocal,
      order.sourceImageUrl,
      order.sourceImages,
      order.problemPhotos,
      order.issuePhotos,
      order.defectPhotos,
      order.originalPhotos,
      order.images,
      order.attachments,
      order['问题'],
      order['问题照片'],
      order['整改前照片'],
      order['缺陷照片'],
      order['现场照片'],
      feishuSnapshot.sourceImageFileID,
      feishuSnapshot.sourceImages,
      feishuSnapshot.problemPhotos,
      feishuSnapshot.issuePhotos,
      feishuSnapshot.defectPhotos,
      feishuSnapshot.attachments,
      feishuSnapshot['问题'],
      feishuSnapshot['问题照片'],
      feishuSnapshot['整改前照片'],
      feishuSnapshot['缺陷照片'],
      feishuSnapshot['现场照片']
    );
    decorated.afterPhotos = collectPhotos(
      order.evidencePhotos,
      order.rectification && order.rectification.evidencePhotos,
      order.closureImages,
      feishuSnapshot.closureImages
    );
    decorated.evidencePhotos = decorated.afterPhotos.slice();
    decorated.primaryItem = decorated.items[0] || {};
    var primaryItem = decorated.primaryItem;
    decorated.taskTitle = firstText(primaryItem.name, primaryItem.title, order.title, feishuSnapshot.title, snapshotItem.name, snapshotItem.title, primaryItem.description, snapshotItem.description, '整改任务');
    decorated.taskSeverityName = firstText(primaryItem.severityName, primaryItem.level, snapshotItem.level, order.level, '一般缺陷');
    decorated.taskProjectName = firstText(order.projectName, feishuSnapshot.projectName);
    decorated.taskDeviceName = firstText(order.deviceName, feishuSnapshot.deviceName);
    decorated.taskComponentName = firstText(primaryItem.systemName, primaryItem.componentName, order.systemName, order.componentName, snapshotItem.systemName, snapshotItem.componentName, feishuSnapshot.systemName, feishuSnapshot.componentName);
    decorated.taskPositionText = firstText(order.positionCode, primaryItem.positionCode, order.location, primaryItem.location, feishuSnapshot.positionCode, feishuSnapshot.location, snapshotItem.positionCode, '未填写具体位置');
    decorated.taskEquipmentText = joinUnique([decorated.taskDeviceName, decorated.taskComponentName]) || '未填写设备部件';
    decorated.taskLocationDetail = joinUnique([decorated.taskProjectName, decorated.taskDeviceName, decorated.taskComponentName, decorated.taskPositionText]);
    decorated.taskDescription = firstText(primaryItem.description, order.description, snapshotItem.description, feishuSnapshot.description);
    if (decorated.taskDescription === decorated.taskTitle) decorated.taskDescription = '';
    decorated.taskRequirement = firstText(primaryItem.suggestion, order.suggestion, order.requirement, snapshotItem.suggestion, feishuSnapshot.requirement);
    decorated.sourcePhotoCount = decorated.beforePhotos.length;
    decorated.sourceImageUrl = decorated.beforePhotos[0] || '';
    decorated.deadlineText = formatDeadline(order.deadline || feishuSnapshot.deadline);
    var reminderConfig = order._reminderConfig || this.data.reminderConfig || {};
    var reminderState = order._reminderState || this.data.reminderState || {};
    var reminderEnabled = !!reminderState.enabled;
    var reminderNeedsRenewal = !!reminderState.needsRenewal;
    var reminderSendTime = reminderState.sendTime || reminderConfig.sendTime || this.data.reminderSendTime || '09:00';
    var reminderStatusText = reminderEnabled
      ? ('已开启，系统将在每天 ' + reminderSendTime + ' 检查并提醒')
      : reminderNeedsRenewal
        ? '上一次提醒授权已使用，请再次开启下一次提醒'
        : '未开启微信整改提醒';
    var isClosed = order.status === 'closed';
    var isReview = order.status === 'review';
    // Legacy orders did not record which evidence submission was synced. When such
    // an order has been reopened and is waiting for review, never reuse the old
    // "synced" badge for the newly submitted photos.
    var syncMatchesSubmission = order.feishuClosureSubmissionAt
      ? order.feishuClosureSubmissionAt === order.submittedAtText
      : order.status !== 'review';
    var isExternalClosing = !!order.feishuRecordId && syncMatchesSubmission && (order.feishuClosureSyncState === 'synced' || order.feishuClosureSyncState === 'verifying' || order.feishuClosureSyncState === 'failed');
    var hasToken = !!(this.data.shareToken || order.shareToken);
    var statusNames = { pending: '待整改', rectifying: '整改中', review: '待复验', closed: '已闭环', rejected: '已驳回' };
    this.setData({
      loading: false, errorMessage: '', order: decorated,
      displayStatus: statusNames[order.status] || (this.data.localPhotos.length ? '整改中' : '待整改'),
      isClosed: isClosed, isReview: isReview, isExternalClosing: isExternalClosing, canOperate: !isClosed && !isReview && hasToken,
      canManageProject: !this.data.fromShare && app.canEditCurrentProject(),
      measurement: order.measurement || this.data.measurement,
      rectificationNote: order.rectificationNote || this.data.rectificationNote,
      reminderConfig: reminderConfig, reminderState: reminderState,
      reminderConfigured: !!reminderConfig.templateConfigured,
      reminderEnabled: reminderEnabled, reminderNeedsRenewal: reminderNeedsRenewal,
      reminderModeName: reminderConfig.modeName || (reminderConfig.mode === 'long_term' ? '长期订阅' : '一次性订阅'),
      reminderStatusText: reminderStatusText,
      reminderRecipientText: reminderEnabled ? '当前微信用户已订阅' : '当前打开分享任务的微信用户',
      reminderSendTime: reminderSendTime
    });
    this._resolveCloudPhotos(decorated);
  },

  _resolveCloudPhotos: function (order) {
    var self = this;
    var fileList = collectPhotos(order.beforePhotos, order.afterPhotos).filter(function (url) {
      return /^cloud:\/\//.test(url);
    });
    if (!fileList.length || !wx.cloud || !wx.cloud.getTempFileURL) return;
    wx.cloud.getTempFileURL({
      fileList: fileList,
      success: function (res) {
        var urlMap = {};
        (res.fileList || []).forEach(function (item) {
          if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
        });
        var current = self.data.order;
        if (!current || current.id !== order.id) return;
        var nextOrder = Object.assign({}, current);
        nextOrder.beforePhotos = (current.beforePhotos || []).map(function (url) { return urlMap[url] || url; });
        nextOrder.afterPhotos = (current.afterPhotos || []).map(function (url) { return urlMap[url] || url; });
        nextOrder.evidencePhotos = nextOrder.afterPhotos.slice();
        nextOrder.sourcePhotoCount = nextOrder.beforePhotos.length;
        nextOrder.sourceImageUrl = nextOrder.beforePhotos[0] || '';
        self.setData({ order: nextOrder });
      }
    });
  },

  enableReminder: function () {
    var self = this;
    var config = this.data.reminderConfig || {};
    var order = this.data.order || {};
    var templateId = config.templateId || '';
    if (!templateId || !config.templateConfigured) {
      wx.showModal({ title: '提醒功能待配置', content: '管理员需要先在微信公众平台配置订阅消息模板，并在云函数环境变量中填写模板ID。', showCancel: false });
      return;
    }
    if (!wx.requestSubscribeMessage) {
      wx.showModal({ title: '当前微信版本不支持', content: '请升级微信后重新打开整改单。', showCancel: false });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: function (res) {
        if (res[templateId] !== 'accept') {
          wx.showToast({ title: '未同意接收整改提醒', icon: 'none' });
          return;
        }
        self.setData({ reminderLoading: true });
        app.registerRectificationReminder(self.data.projectId, order.id || self.data.orderId, self.data.shareToken || order.shareToken, templateId, self.data.reminderSendTime)
          .then(function (updated) {
            self.setData({ reminderLoading: false });
            self._applyOrder(updated);
            wx.showToast({ title: config.mode === 'long_term' ? '每日提醒已开启' : '下一次提醒已开启', icon: 'success' });
          })
          .catch(function (err) {
            self.setData({ reminderLoading: false });
            wx.showModal({ title: '提醒开启失败', content: err.message || '请稍后重试', showCancel: false });
          });
      },
      fail: function (err) {
        wx.showModal({ title: '无法申请提醒权限', content: (err && err.errMsg) || '请检查小程序订阅消息配置', showCancel: false });
      }
    });
  },

  onReminderTimeChange: function (event) {
    this.setData({ reminderSendTime: event.detail.value || '09:00' });
  },

  disableReminder: function () {
    var self = this;
    var order = this.data.order || {};
    if (this.data.reminderLoading) return;
    this.setData({ reminderLoading: true });
    app.disableRectificationReminder(this.data.projectId, order.id || this.data.orderId, this.data.shareToken || order.shareToken)
      .then(function (updated) {
        self.setData({ reminderLoading: false });
        self._applyOrder(updated);
        wx.showToast({ title: '提醒已关闭', icon: 'success' });
      })
      .catch(function (err) {
        self.setData({ reminderLoading: false });
        wx.showModal({ title: '关闭失败', content: err.message || '请稍后重试', showCancel: false });
      });
  },

  chooseEvidence: function () {
    var self = this;
    var remain = 9 - this.data.localPhotos.length;
    if (remain <= 0) { wx.showToast({ title: '最多上传9张照片', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sourceType: ['camera', 'album'], sizeType: ['compressed'],
      success: function (res) {
        var paths = (res.tempFiles || []).map(function (item) { return item.tempFilePath; });
        self.setData({ localPhotos: self.data.localPhotos.concat(paths), displayStatus: '整改中', closureError: '' });
      }
    });
  },

  removeEvidence: function (e) {
    var index = Number(e.currentTarget.dataset.index); var photos = this.data.localPhotos.slice();
    photos.splice(index, 1); this.setData({ localPhotos: photos, displayStatus: photos.length ? '整改中' : '待整改' });
  },

  previewPhoto: function (e) {
    var current = e.currentTarget.dataset.url;
    var group = e.currentTarget.dataset.group;
    var urls = this.data.localPhotos;
    if (group === 'before') urls = this.data.order.beforePhotos || [];
    if (group === 'after' || group === 'closed') urls = this.data.order.afterPhotos || this.data.order.evidencePhotos || [];
    if (current) wx.previewImage({ current: current, urls: urls.length ? urls : [current] });
  },

  previewSource: function () {
    var urls = this.data.order && this.data.order.beforePhotos || [];
    var url = urls[0] || (this.data.order && this.data.order.sourceImageUrl);
    if (url) wx.previewImage({ current: url, urls: urls.length ? urls : [url] });
  },

  onMeasurementInput: function (e) { this.setData({ measurement: e.detail.value }); },
  onNoteInput: function (e) { this.setData({ rectificationNote: e.detail.value }); },

  submitClosure: function () {
    var self = this;
    if (!this.data.canOperate || this.data.submitting) return;
    if (!String(this.data.rectificationNote || '').trim()) {
      this.setData({ closureError: '请填写整改情况说明，说明采取了哪些处理措施。' });
      wx.showToast({ title: '请填写整改说明', icon: 'none' });
      return;
    }
    if (!this.data.localPhotos.length) {
      this.setData({ closureError: '请至少上传一张整改后的现场照片，作为闭环证据。' });
      wx.showToast({ title: '缺少整改照片', icon: 'none' });
      return;
    }
    this.setData({ closureError: '' });
    wx.showModal({
      title: '提交整改复验',
      content: '提交后进入“待复验”。整改单创建人、项目经理或监理工程师确认合格后，质量台账才会正式闭环。',
      confirmText: '提交复验', confirmColor: '#20b98b',
      success: function (res) { if (res.confirm) self._uploadAndClose(); }
    });
  },

  _uploadAndClose: function () {
    var self = this; var order = this.data.order;
    var photos = this.data.localPhotos.slice();
    this.setData({ submitting: true });
    wx.showLoading({ title: '上传照片', mask: true });
    var uploadBatch = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var fileIDs = [];
    var uploadSequence = photos.reduce(function (chain, filePath, index) {
      return chain.then(function () {
        wx.showLoading({ title: '上传照片 ' + (index + 1) + '/' + photos.length, mask: true });
        if (/^cloud:\/\//.test(filePath)) {
          fileIDs.push(filePath);
          return null;
        }
        var cloudPath = 'rectifications/' + self.data.projectId + '/' + order.id + '/evidence-' + uploadBatch + '-' + index + '.jpg';
        return uploadEvidencePhoto(filePath, cloudPath, 1).then(function (fileID) {
          fileIDs.push(fileID);
        });
      });
    }, Promise.resolve());
    uploadSequence.then(function () {
      return app.submitOpenRectification(self.data.projectId, order.id, self.data.shareToken || order.shareToken, {
        evidencePhotos: fileIDs, measurement: self.data.measurement, rectificationNote: self.data.rectificationNote,
        submittedAtText: util.formatDateTime()
      });
    }).then(function (updated) {
      wx.hideLoading(); self.setData({ submitting: false, localPhotos: [] }); self._applyOrder(updated);
      wx.showToast({ title: '已提交复验', icon: 'success', duration: 1800 });
    }).catch(function (err) {
      wx.hideLoading();
      var message = (err && (err.message || err.errMsg)) || '请检查云开发环境和网络后重试。';
      self.setData({ submitting: false, closureError: message });
      wx.showModal({ title: '闭环提交失败', content: message, showCancel: false });
    });
  },

  onReviewNoteInput: function (e) { this.setData({ reviewNote: e.detail.value }); },

  acceptReview: function () {
    var self = this;
    if (!this.data.isCreatorView || !this.data.isReview || this.data.reviewing) return;
    wx.showModal({
      title: '确认复验通过',
      content: '确认后整改单、关联缺陷和AI质检历史将统一更新为“已闭环”。',
      confirmText: '确认闭环',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ reviewing: true });
        app.reviewOpenRectification(self.data.order.id, self.data.reviewNote).then(function (order) {
          self.setData({ reviewing: false }); self._applyOrder(order);
          wx.showToast({ title: order.feishuRecordId && order.feishuClosureSyncState === 'synced' ? '已回传飞书' : '复验通过，飞书待回传', icon: 'none' });
        }).catch(function (err) {
          self.setData({ reviewing: false }); wx.showModal({ title: '复验失败', content: err.message || '请稍后重试', showCancel: false });
        });
      }
    });
  },

  rejectReview: function () {
    var self = this;
    if (!this.data.isCreatorView || !this.data.isReview || this.data.reviewing) return;
    if (!String(this.data.reviewNote || '').trim()) { wx.showToast({ title: '请填写驳回原因', icon: 'none' }); return; }
    wx.showModal({
      title: '退回继续整改', content: '整改协作链接将重新开放，原提交人或其他人员均可再次上传证据。',
      confirmText: '确认退回',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ reviewing: true });
        app.rejectOpenRectification(self.data.order.id, self.data.reviewNote).then(function (order) {
          self.setData({ reviewing: false }); self._applyOrder(order); wx.showToast({ title: '已退回整改', icon: 'success' });
        }).catch(function (err) {
          self.setData({ reviewing: false }); wx.showModal({ title: '退回失败', content: err.message || '请稍后重试', showCancel: false });
        });
      }
    });
  },

  reopenOrder: function () {
    var self = this;
    if (!this.data.isCreatorView || !this.data.order) return;
    wx.showModal({ title: '重新打开整改', content: '重新打开后，共享链接可再次上传证据并完成闭环。', confirmText: '重新打开', success: function (res) {
      if (!res.confirm) return;
      wx.showLoading({ title: '正在重新打开...' });
      app.reopenOpenRectification(self.data.order.id).then(function (order) {
        wx.hideLoading(); self._applyOrder(order); wx.showToast({ title: '已重新打开', icon: 'success' });
      }).catch(function (err) { wx.hideLoading(); wx.showModal({ title: '操作失败', content: err.message || '请稍后重试', showCancel: false }); });
    }});
  },

  retryFeishuSync: function () {
    var self = this; var order = this.data.order;
    if (!order || !order.feishuRecordId || this.data.reviewing) return;
    this.setData({ reviewing: true });
    wx.showLoading({ title: '正在回传飞书…' });
    app.syncFeishuRectificationClosure(order).then(function (updated) {
      wx.hideLoading(); self.setData({ reviewing: false }); self._applyOrder(updated); wx.showToast({ title: '已回传飞书', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading(); self.setData({ reviewing: false }); wx.showModal({ title: '回传失败', content: err.message || '请检查飞书授权后重试', showCancel: false });
    });
  },

  openSharePreview: function () {
    var order = this.data.order || {};
    var orderId = order.id || this.data.orderId;
    if (!orderId) return;
    wx.navigateTo({
      url: '/pages/rectification-share/rectification-share?id=' + encodeURIComponent(orderId)
    });
  },

  onShareAppMessage: function () {
    var order = this.data.order || {}; var token = this.data.shareToken || order.shareToken || '';
    return {
      title: '整改协作单 ' + (order.id || '') + '｜点击上传整改照片并提交复验',
      path: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(order.id || this.data.orderId) + '&projectId=' + encodeURIComponent(order.projectId || this.data.projectId) + '&token=' + encodeURIComponent(token) + '&from=share'
    };
  }
});
