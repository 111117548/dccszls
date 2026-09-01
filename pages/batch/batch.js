// pages/batch/batch.js
var util = require('../../utils/util.js');
var app = getApp();

Page({
  data: {
    maxPhotos: 9,
    photos: [],          // [{id, path, status, defects, areaName, majorCount, moderateCount, minorCount, fileID, errorMsg}]
    analyzing: false,
    analysisDone: false,
    currentPhotoIndex: 0,
    progressPercent: 0,
    totalPhotos: 0,
    totalDefects: 0,
    totalMajor: 0,
    totalModerate: 0,
    totalMinor: 0,
    batchCommitted: false,
    committedRecordId: '',
    isDemoMode: true,
    severityOptions: ['严重', '一般', '轻微'],
    // Edit modal
    showEditModal: false,
    editPhotoIdx: -1,
    editDefectIdx: -1,
    editForm: { name: '', severityIdx: 1, description: '', suggestion: '' },
    // Add modal
    showAddModal: false,
    addPhotoIdx: -1,
    addForm: { name: '', severityIdx: 1, description: '', suggestion: '' }
  },

  onLoad: function () {
    this.setData({
      isDemoMode: !!(app.globalData.aiConfig && app.globalData.aiConfig.demoMode),
      photos: this._normalizePhotos(this.data.photos)
    });
  },

  onShow: function () {
    this.setData({
      isDemoMode: !!(app.globalData.aiConfig && app.globalData.aiConfig.demoMode),
      photos: this._normalizePhotos(this.data.photos)
    });
  },

  onUnload: function () {
    if (this._demoTimer) {
      clearTimeout(this._demoTimer);
      this._demoTimer = null;
    }
  },

  _normalizePhotos: function (photos) {
    if (!Array.isArray(photos)) return [];
    return photos.filter(function (photo) { return !!photo; }).map(function (photo, index) {
      return Object.assign({
        id: Date.now() + '_' + index,
        path: '',
        status: 'pending',
        defects: [],
        areaName: '',
        defectCount: 0,
        majorCount: 0,
        moderateCount: 0,
        minorCount: 0,
        fileID: '',
        errorMsg: ''
      }, photo, {
        defects: Array.isArray(photo.defects) ? photo.defects.filter(function (defect) { return !!defect; }) : []
      });
    });
  },

  // ========================================================
  // Photo Selection
  // ========================================================

  choosePhotos: function () {
    var self = this;
    var remaining = self.data.maxPhotos - self.data.photos.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择' + self.data.maxPhotos + '张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var tempFiles = res && Array.isArray(res.tempFiles) ? res.tempFiles : [];
        var newPhotos = tempFiles.map(function (f, i) {
          return {
            id: Date.now() + '_' + i,
            path: f.tempFilePath,
            status: 'pending',
            defects: [],
            areaName: '',
            majorCount: 0,
            moderateCount: 0,
            minorCount: 0,
            fileID: '',
            errorMsg: ''
          };
        });
        self.setData({ photos: self._normalizePhotos(self.data.photos).concat(newPhotos) });
      }
    });
  },

  removePhoto: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var photos = this._normalizePhotos(this.data.photos);
    if (!Number.isInteger(idx) || idx < 0 || idx >= photos.length) return;
    photos.splice(idx, 1);
    this.setData({ photos: photos });
  },

  previewPhoto: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var photo = this._normalizePhotos(this.data.photos)[idx];
    if (!photo) return;
    wx.previewImage({ urls: [photo.path], current: photo.path });
  },

  // ========================================================
  // Batch Analysis
  // ========================================================

  startBatchAnalysis: function () {
    var normalizedPhotos = this._normalizePhotos(this.data.photos);
    if (normalizedPhotos.length === 0) return;
    var self = this;
    var config = app.globalData.aiConfig || { demoMode: true };

    self.setData({
      photos: normalizedPhotos,
      isDemoMode: !!config.demoMode,
      analyzing: true,
      analysisDone: false,
      currentPhotoIndex: 0,
      progressPercent: 0,
      batchCommitted: false,
      committedRecordId: ''
    });

    if (config.demoMode) {
      self._processNextDemoPhoto(0);
      return;
    }

    // Process photos sequentially
    self._processNextPhoto(0, config);
  },

  _processNextDemoPhoto: function (index) {
    var self = this;
    var photos = self._normalizePhotos(self.data.photos);
    if (index >= photos.length) {
      self._demoTimer = null;
      self._onBatchComplete();
      return;
    }

    self.setData({
      currentPhotoIndex: index,
      progressPercent: Math.round((index / photos.length) * 100),
      ['photos[' + index + '].status']: 'analyzing'
    });

    self._demoTimer = setTimeout(function () {
      var areaKey = index % 2 === 0 ? 'shell' : 'ashopper';
      var demoResult = JSON.parse(JSON.stringify(util.getDemoDefects(areaKey) || { defects: [] }));
      self._onPhotoAnalysisDone(index, demoResult, util.getAreaName(areaKey) + '（演示）');
      self._processNextDemoPhoto(index + 1);
    }, 450);
  },

  _processNextPhoto: function (index, config) {
    var self = this;
    var photos = self._normalizePhotos(self.data.photos);

    if (index >= photos.length) {
      // All done
      self._onBatchComplete();
      return;
    }

    self.setData({
      currentPhotoIndex: index,
      progressPercent: Math.round((index / photos.length) * 100),
      ['photos[' + index + '].status']: 'analyzing'
    });

    var filePath = photos[index].path;

    // Step 1: Quality check + area detection
    util.callAIQualityCheck(filePath, config)
      .then(function (qualityData) {
        var quality = qualityData.quality || {};
        var detectedKey = qualityData.detectedArea || '';
        var detectedName = util.getAreaName(detectedKey);

        // If photo not usable, skip analysis
        if (quality.usable === false) {
          self.setData({
            ['photos[' + index + '].status']: 'error',
            ['photos[' + index + '].errorMsg']: quality.qualityMessage || '照片质量不佳'
          });
          self._processNextPhoto(index + 1, config);
          return;
        }

        // Step 2: Detailed analysis
        var areaData = util.standardsDetail[detectedKey];
        var areaItems = areaData && Array.isArray(areaData.items) ? areaData.items : [];
        var visualItemIds = areaItems.filter(function (item) {
          return util.getInspectionMethod(item).aiApplicable;
        }).map(function (item) { return item.id; });
        return util.callAIAnalysis(filePath, config, detectedKey, visualItemIds, '批量巡检照片，具体空间位置待人工复核', { projectId: app.getV3State().project.id })
          .then(function (analysisResult) {
            self._onPhotoAnalysisDone(index, analysisResult, detectedName);
            self._processNextPhoto(index + 1, config);
          });
      })
      .catch(function (err) {
        console.error('[batch] Photo ' + index + ' error:', err.message);
        self.setData({
          ['photos[' + index + '].status']: 'error',
          ['photos[' + index + '].errorMsg']: err.message || '分析失败'
        });
        self._processNextPhoto(index + 1, config);
      });
  },

  _onPhotoAnalysisDone: function (index, result, areaName) {
    result = result && typeof result === 'object' ? result : {};
    result.defects = Array.isArray(result.defects) ? result.defects.filter(function (defect) { return !!defect; }) : [];

    // Apply confidence filter
    var CONFIDENCE_THRESHOLD = 0.75;
    result.defects = result.defects.filter(function (d) {
      if (d.confidence == null) return true;
      return d.confidence >= CONFIDENCE_THRESHOLD;
    });

    // Re-number and add _idx for referencing
    result.defects.forEach(function (d, i) {
      d.id = i + 1;
      d._idx = i;
      d.confirmed = false;
      d.typeName = util.getTypeName(d.type);
      d.severityName = util.getSeverityCN(d.severity);
    });

    // Count severities
    var major = 0, moderate = 0, minor = 0;
    result.defects.forEach(function (d) {
      if (d.severity === 'major') major++;
      else if (d.severity === 'moderate') moderate++;
      else minor++;
    });

    this.setData({
      ['photos[' + index + '].status']: 'done',
      ['photos[' + index + '].defects']: result.defects,
      ['photos[' + index + '].areaName']: areaName,
      ['photos[' + index + '].majorCount']: major,
      ['photos[' + index + '].moderateCount']: moderate,
      ['photos[' + index + '].minorCount']: minor
      ,['photos[' + index + '].defectCount']: result.defects.length
    });
  },

  _onBatchComplete: function () {
    var photos = this._normalizePhotos(this.data.photos);
    var totalDefects = 0, totalMajor = 0, totalModerate = 0, totalMinor = 0;
    var totalPhotos = 0;

    photos.forEach(function (p) {
      if (p.status === 'done') {
        totalPhotos++;
        totalDefects += (p.defects || []).length;
        totalMajor += p.majorCount;
        totalModerate += p.moderateCount;
        totalMinor += p.minorCount;
      }
    });

    this.setData({
      analyzing: false,
      analysisDone: true,
      progressPercent: 100,
      totalPhotos: totalPhotos,
      totalDefects: totalDefects,
      totalMajor: totalMajor,
      totalModerate: totalModerate,
      totalMinor: totalMinor
    });

    // 分析结果仅保留为待复核草稿，人工确认后再提交。
  },

  _saveBatchToHistory: function (photos, totalDefects, totalMajor, totalModerate, totalMinor) {
    if (this.data.batchCommitted || this.data.isDemoMode) return false;
    // V3.0: no-defect inspections are also valid quality evidence and must be saved.

    var allDefects = [];
    var photoIdxCounter = 0;

    photos.forEach(function (p) {
      if (p.status !== 'done') return;
      var currentPhotoIdx = photoIdxCounter;
      photoIdxCounter++;

      (p.defects || []).forEach(function (d, defectIndex) {
        var batchDefectId = 'B' + (currentPhotoIdx + 1) + '-D' + (defectIndex + 1);
        allDefects.push({
          id: batchDefectId,
          sourceDefectId: d.id,
          name: d.name,
          type: d.type || 'other',
          severity: d.severity,
          level: d.level || (d.severity === 'major' ? 'III' : d.severity === 'moderate' ? 'II' : 'I'),
          description: d.description || '',
          suggestion: d.suggestion || '',
          standard: d.standard || '',
          confidence: d.confidence || 0,
          _userAdded: d._userAdded || false,
          photoIdx: currentPhotoIdx,
          deviceName: d.deviceName || p.areaName || '批量巡检',
          positionCode: d.positionCode || ('批量照片 ' + (currentPhotoIdx + 1))
        });
      });
    });

    var record = {
      id: Date.now(),
      projectId: app.getV3State().project.id,
      deviceId: app.getV3State().project.deviceId || '',
      type: 'batch',
      area: 'batch',
      areaName: '批量巡检',
      areaIcon: '📋',
      qualityScore: 0,
      majorCount: totalMajor,
      moderateCount: totalModerate,
      minorCount: totalMinor,
      totalDefects: totalDefects,
      defects: allDefects,
      totalPhotos: photos.filter(function (p) { return p.status === 'done'; }).length,
      image: (photos.length > 0 && photos[0].path) ? photos[0].path : '',
      reviewStatus: 'confirmed',
      reviewStatusName: '人工已复核',
      time: util.formatDateTime(),
      timestamp: Date.now()
    };

    var records = app.globalData.historyRecords;
    records.unshift(record);

    // Every defect-bearing batch inspection enters the same open-link
    // rectification workflow as a single AI inspection. The shared recipient
    // does not need to bind a project identity.
    if (allDefects.length > 0) {
      app.createOpenRectificationOrder(record, record, allDefects, record.image);
    }
    this.setData({ batchCommitted: true, committedRecordId: record.id });

    // Keep max 200 records
    if (records.length > 200) {
      records = records.slice(0, 200);
      app.globalData.historyRecords = records;
    }

    app.saveHistory();
    app.syncBatchToCloud(record);
    return true;
  },

  confirmAllDefects: function () {
    var updates = {};
    this.data.photos.forEach(function (photo, pi) {
      (photo.defects || []).forEach(function (defect, di) {
        updates['photos[' + pi + '].defects[' + di + '].confirmed'] = true;
      });
    });
    this.setData(updates);
    wx.showToast({ title: '已标记全部复核', icon: 'success' });
  },

  commitBatchResults: function () {
    if (this.data.isDemoMode) {
      wx.showModal({
        title: '当前为批量演示结果',
        content: '演示结果可以复核、编辑和查看流程，但不会写入正式检查记录。请在首页配置云端AI并关闭演示模式后，再生成正式记录。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    var unconfirmed = 0;
    this.data.photos.forEach(function (photo) {
      (photo.defects || []).forEach(function (defect) { if (!defect.confirmed) unconfirmed++; });
    });
    if (unconfirmed > 0) {
      wx.showModal({ title: '仍有未复核缺陷', content: '还有 ' + unconfirmed + ' 条AI缺陷未确认。请逐条确认、编辑或删除后再提交。', showCancel: false });
      return;
    }
    if (this._saveBatchToHistory(this.data.photos, this.data.totalDefects, this.data.totalMajor, this.data.totalModerate, this.data.totalMinor)) {
      wx.showToast({ title: '批量巡检已提交', icon: 'success' });
    }
  },

  retryPhoto: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var photos = this._normalizePhotos(this.data.photos);
    if (!Number.isInteger(idx) || idx < 0 || idx >= photos.length) return;
    var config = app.globalData.aiConfig || { demoMode: true };
    this.setData({
      ['photos[' + idx + '].status']: 'pending'
    });
    if (config.demoMode) this._processNextDemoPhoto(idx);
    else this._processNextPhoto(idx, config);
  },

  // ========================================================
  // Defect Confirm / Edit / Add / Remove
  // ========================================================

  confirmDefect: function (e) {
    var pi = Number(e.currentTarget.dataset.photoIndex);
    var di = Number(e.currentTarget.dataset.defectIndex);
    var photos = this._normalizePhotos(this.data.photos);
    if (!photos[pi] || !photos[pi].defects[di]) return;
    var key = 'photos[' + pi + '].defects[' + di + '].confirmed';
    this.setData({ [key]: !photos[pi].defects[di].confirmed });
  },

  editDefect: function (e) {
    var pi = Number(e.currentTarget.dataset.photoIndex);
    var di = Number(e.currentTarget.dataset.defectIndex);
    var photos = this._normalizePhotos(this.data.photos);
    if (!photos[pi] || !photos[pi].defects[di]) return;
    var defect = photos[pi].defects[di];
    var severityMap = { major: 0, moderate: 1, minor: 2 };
    this.setData({
      showEditModal: true,
      editPhotoIdx: pi,
      editDefectIdx: di,
      editForm: {
        name: defect.name || '',
        severityIdx: severityMap[defect.severity] != null ? severityMap[defect.severity] : 1,
        description: defect.description || '',
        suggestion: defect.suggestion || ''
      }
    });
  },

  onEditSeverityChange: function (e) {
    this.setData({ 'editForm.severityIdx': parseInt(e.detail.value) });
  },

  onEditInput: function (e) {
    var field = e.currentTarget.dataset.field;
    this.setData({ ['editForm.' + field]: e.detail.value });
  },

  saveEditDefect: function () {
    var pi = this.data.editPhotoIdx;
    var di = this.data.editDefectIdx;
    var form = this.data.editForm;
    var severityMap = ['major', 'moderate', 'minor'];

    this.setData({
      ['photos[' + pi + '].defects[' + di + '].name']: form.name,
      ['photos[' + pi + '].defects[' + di + '].severity']: severityMap[form.severityIdx],
      ['photos[' + pi + '].defects[' + di + '].description']: form.description,
      ['photos[' + pi + '].defects[' + di + '].suggestion']: form.suggestion,
      showEditModal: false
    });
    this._recalcStats();
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  closeEditModal: function () {
    this.setData({ showEditModal: false });
  },

  addDefect: function (e) {
    var pi = Number(e.currentTarget.dataset.photoIndex);
    if (!this._normalizePhotos(this.data.photos)[pi]) return;
    this.setData({
      showAddModal: true,
      addPhotoIdx: pi,
      addForm: { name: '', severityIdx: 1, description: '', suggestion: '' }
    });
  },

  onAddSeverityChange: function (e) {
    this.setData({ 'addForm.severityIdx': parseInt(e.detail.value) });
  },

  onAddInput: function (e) {
    var field = e.currentTarget.dataset.field;
    this.setData({ ['addForm.' + field]: e.detail.value });
  },

  saveAddDefect: function () {
    var form = this.data.addForm;
    if (!form.name) {
      wx.showToast({ title: '请填写缺陷名称', icon: 'none' });
      return;
    }
    var pi = this.data.addPhotoIdx;
    var severityMap = ['major', 'moderate', 'minor'];
    var severity = severityMap[form.severityIdx];
    var photos = this._normalizePhotos(this.data.photos);
    if (!photos[pi]) return;
    var defects = photos[pi].defects || [];

    var newDefect = {
      id: defects.length + 1,
      _idx: defects.length,
      name: form.name,
      severity: severity,
      typeName: '其他',
      severityName: util.getSeverityCN(severity),
      description: form.description,
      suggestion: form.suggestion,
      confirmed: false,
      _userAdded: true,
      confidence: 1.0
    };

    var key = 'photos[' + pi + '].defects';
    var updated = defects.slice();
    updated.push(newDefect);
    this.setData({ [key]: updated, showAddModal: false });
    this._recalcStats();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  closeAddModal: function () {
    this.setData({ showAddModal: false });
  },

  removeDefect: function (e) {
    var pi = Number(e.currentTarget.dataset.photoIndex);
    var di = Number(e.currentTarget.dataset.defectIndex);
    var photos = this._normalizePhotos(this.data.photos);
    if (!photos[pi] || !photos[pi].defects[di]) return;
    var defects = photos[pi].defects.slice();
    defects.splice(di, 1);
    // Re-number
    defects.forEach(function (d, i) { d.id = i + 1; d._idx = i; });
    this.setData({ ['photos[' + pi + '].defects']: defects });
    this._recalcStats();
  },

  _recalcStats: function () {
    var photos = this._normalizePhotos(this.data.photos);
    var totalDefects = 0, totalMajor = 0, totalModerate = 0, totalMinor = 0;

    photos.forEach(function (p, idx) {
      if (p.status !== 'done') return;
      var major = 0, moderate = 0, minor = 0;
      (p.defects || []).forEach(function (d) {
        if (d.severity === 'major') major++;
        else if (d.severity === 'moderate') moderate++;
        else minor++;
      });
      totalDefects += p.defects.length;
      totalMajor += major;
      totalModerate += moderate;
      totalMinor += minor;
    });

    // Update per-photo counts too
    var updates = {};
    photos.forEach(function (p, idx) {
      if (p.status !== 'done') return;
      var major = 0, moderate = 0, minor = 0;
      (p.defects || []).forEach(function (d) {
        if (d.severity === 'major') major++;
        else if (d.severity === 'moderate') moderate++;
        else minor++;
      });
      updates['photos[' + idx + '].majorCount'] = major;
      updates['photos[' + idx + '].moderateCount'] = moderate;
      updates['photos[' + idx + '].minorCount'] = minor;
      updates['photos[' + idx + '].defectCount'] = p.defects.length;
    });

    updates.totalDefects = totalDefects;
    updates.totalMajor = totalMajor;
    updates.totalModerate = totalModerate;
    updates.totalMinor = totalMinor;
    this.setData(updates);
  },

  // ========================================================
  // Export Word Report
  // ========================================================

  exportReport: function () {
    if (!this.data.batchCommitted) {
      wx.showToast({ title: '请先完成人工复核并提交', icon: 'none' });
      return;
    }
    var self = this;
    var photos = this.data.photos;

    // Collect all defects across all photos, with photoIdx for grouping
    var allDefects = [];
    var photoFileIDs = [];
    var photoIdxCounter = 0;

    photos.forEach(function (p) {
      if (p.status !== 'done') return;
      var currentPhotoIdx = photoIdxCounter;
      photoIdxCounter++;

      if (p.defects.length > 0) {
        p.defects.forEach(function (d) {
          allDefects.push({
            name: d.name,
            severity: d.severity,
            description: d.description,
            suggestion: d.suggestion || '',
            type: d.type || 'other',
            photoIdx: currentPhotoIdx
          });
        });
      }

      // Collect fileID for this photo
      photoFileIDs.push(p.fileID || '');
    });

    if (allDefects.length === 0) {
      wx.showToast({ title: '没有缺陷可导出', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在生成报告...' });

    // First upload all photos to cloud to get fileIDs
    var uploadPromises = [];
    photos.forEach(function (p) {
      if (p.status !== 'done') return;
      if (p.fileID) {
        uploadPromises.push(Promise.resolve(p.fileID));
      } else {
        uploadPromises.push(
          util.uploadToCloud(p.path, 'batch-photos').then(function (fileID) {
            return fileID;
          }).catch(function () {
            return '';
          })
        );
      }
    });

    Promise.all(uploadPromises).then(function (fileIDs) {
      // Update photos with fileIDs
      var updates = {};
      var fi = 0;
      photos.forEach(function (p, idx) {
        if (p.status !== 'done') return;
        if (!p.fileID) {
          updates['photos[' + idx + '].fileID'] = fileIDs[fi];
        }
        fi++;
      });
      self.setData(updates);

      // Collect fileIDs for report
      // Use Promise.all results directly. The local photos array still contains
      // the pre-setData values and previously caused newly uploaded photos to be omitted.
      var reportFileIDs = fileIDs.filter(function (id) { return !!id; });

      // Build report data
      var reportData = {
        project: 'ESP安装质量检查',
        date: util.formatDate(),
        inspector: 'AI智能检测',
        area: '批量巡检'
      };

      // Count severities
      var majorCount = 0, moderateCount = 0, minorCount = 0;
      allDefects.forEach(function (d) {
        if (d.severity === 'major') majorCount++;
        else if (d.severity === 'moderate') moderateCount++;
        else minorCount++;
      });

      // Call generate-report cloud function
      wx.cloud.callFunction({
        name: 'generate-report',
        data: {
          reportData: reportData,
          defects: allDefects,
          majorCount: majorCount,
          moderateCount: moderateCount,
          minorCount: minorCount,
          photoFileIDs: reportFileIDs
        },
        success: function (res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            self._downloadAndOpenReport(res.result.fileID, res.result.fileName);
          } else {
            wx.showToast({ title: '报告生成失败', icon: 'none' });
          }
        },
        fail: function (err) {
          wx.hideLoading();
          console.error('[batch] Report generation failed:', err);
          wx.showToast({ title: '报告生成失败', icon: 'none' });
        }
      });
    });
  },

  _downloadAndOpenReport: function (fileID, fileName) {
    wx.showLoading({ title: '正在下载...' });

    // Convert cloud fileID to HTTPS URL first
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        var fileInfo = res.fileList && res.fileList[0];
        if (!fileInfo || fileInfo.status !== 0 || !fileInfo.tempFileURL) {
          wx.hideLoading();
          wx.showToast({ title: '获取下载链接失败', icon: 'none' });
          return;
        }

        var downloadUrl = fileInfo.tempFileURL;

        wx.downloadFile({
          url: downloadUrl,
          success: function (dlRes) {
            wx.hideLoading();
            if (dlRes.statusCode === 200) {
              wx.openDocument({
                filePath: dlRes.tempFilePath,
                showMenu: true,
                fileType: 'docx',
                success: function () {
                  wx.showToast({ title: '报告已打开', icon: 'success' });
                },
                fail: function () {
                  wx.showToast({ title: '打开文档失败', icon: 'none' });
                }
              });
            } else {
              wx.showToast({ title: '下载失败', icon: 'none' });
            }
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '下载失败', icon: 'none' });
          }
        });
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '获取下载链接失败', icon: 'none' });
      }
    });
  },

  // ========================================================
  // Reset
  // ========================================================

  resetBatch: function () {
    if (this._demoTimer) {
      clearTimeout(this._demoTimer);
      this._demoTimer = null;
    }
    this.setData({
      photos: [],
      analyzing: false,
      analysisDone: false,
      currentPhotoIndex: 0,
      progressPercent: 0,
      totalDefects: 0,
      totalMajor: 0,
      totalModerate: 0,
      totalMinor: 0
      ,batchCommitted: false
      ,committedRecordId: ''
    });
  }
});
