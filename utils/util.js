// utils/util.js - V2.0 AI analysis utilities
var dataModule = require('./data.js');
var checklistData = dataModule.checklistData;
var standardsDetail = dataModule.standardsDetail;
var AREA_DETECT_PROMPT = dataModule.AREA_DETECT_PROMPT;
var AI_SYSTEM_PROMPT = dataModule.AI_SYSTEM_PROMPT;
var areaOptions = dataModule.areaOptions;

// ============================================================
// 上传文件到云存储并返回 fileID
// ============================================================
function uploadToCloud(filePath, folder) {
  return new Promise(function (resolve, reject) {
    var cloudPath = (folder || 'ai-images') + '/' + Date.now() + '_' +
      Math.random().toString(36).substr(2, 8) + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (res) { resolve(res.fileID); },
      fail: function (err) { reject(new Error('图片上传失败: ' + (err.errMsg || '未知错误'))); }
    });
  });
}

// ============================================================
// 客户端压缩图片（上传前调用，减小文件体积加速AI处理）
// 使用 wx.compressImage，压缩到指定宽度，质量80%
// ============================================================
function compressImageBeforeUpload(filePath, maxWidth) {
  return new Promise(function (resolve) {
    wx.getImageInfo({
      src: filePath,
      success: function (info) {
        if (info.width <= (maxWidth || 1280)) {
          resolve(filePath);
          return;
        }
        wx.compressImage({
          src: filePath,
          compressedWidth: maxWidth || 1280,
          quality: 80,
          success: function (res) { resolve(res.tempFilePath); },
          fail: function () { resolve(filePath); }
        });
      },
      fail: function () { resolve(filePath); }
    });
  });
}

// ============================================================
// 调用云函数（通用封装）
// ============================================================
function callCloudFunction(data) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    // 微信云函数当前运行环境最长 60 秒。增加客户端看门狗，避免网络异常时
    // 页面一直停留在“正在分析”且没有任何反馈。
    var watchdog = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error('AI分析等待超时（65秒）。云函数可能已超时或网络连接中断，请查看 ai-analyze 云函数日志。'));
    }, 65000);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      callback(value);
    }

    wx.cloud.callFunction({
      name: 'ai-analyze',
      data: data,
      success: function (res) {
        if (!res.result) {
          finish(reject, new Error('云函数返回为空'));
          return;
        }
        if (!res.result.success) {
          finish(reject, new Error(res.result.error || 'AI分析失败'));
          return;
        }
        finish(resolve, res.result);
      },
      fail: function (err) {
        finish(reject, new Error('云函数调用失败: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

// ============================================================
// V2.0 第1步：照片质量检测 + 部位识别
// ============================================================
function callAIQualityCheck(filePath, config) {
  return compressImageBeforeUpload(filePath, 800).then(function (compressed) {
    return uploadToCloud(compressed, 'ai-images');
  }).then(function (fileID) {
    return callCloudFunction({
      analysisType: 'quality',
      endpoint: config.endpoint,
      model: config.model,
      systemPrompt: AREA_DETECT_PROMPT,
      userPrompt: '请分析这张ESP安装现场照片的质量并识别检查部位。',
      imageFileID: fileID,
      areaKey: '',
      maxTokens: 800,
      temperature: 0.2
    });
  }).then(function (result) {
    return result.data;
  });
}

// ============================================================
// V2.0 构建部位标准文本（注入到提示词中）
// ============================================================
function buildStandardsText(areaKey, itemIds) {
  var area = standardsDetail[areaKey];
  if (!area) return '（未找到该部位的检查标准）';

  var scopedItems = area.items;
  if (itemIds && itemIds.length) {
    scopedItems = area.items.filter(function (item) { return itemIds.indexOf(item.id) !== -1; });
  }

  var lines = [];
  lines.push('【检查部位】' + area.name);
  lines.push('【检查重点】' + area.tip);
  lines.push('');
  lines.push('【检查项列表——共' + scopedItems.length + '项】');

  for (var i = 0; i < scopedItems.length; i++) {
    var item = scopedItems[i];
    lines.push('');
    lines.push('检查项 ' + (i + 1) + '（ID: ' + item.id + '）');
    lines.push('  名称：' + item.title);
    lines.push('  标准：' + item.standard);
    lines.push('  关键检查点：' + item.keyPoints);
    lines.push('  正常状态：' + item.normalDesc);
    lines.push('  异常状态：' + item.abnormalDesc);
    lines.push('  严重等级：' + getSeverityCN(item.severity));
    lines.push('  整改建议：' + item.suggestion);
    lines.push('  视觉识别要点：' + item.visualCues);
  }

  return lines.join('\n');
}

// ============================================================
// V2.0 构建完整分析提示词
// ============================================================
function buildAnalysisPrompt(areaKey, itemIds) {
  var prompt = AI_SYSTEM_PROMPT;
  var standardsText = buildStandardsText(areaKey, itemIds);
  prompt = prompt.replace('{STANDARDS_PLACEHOLDER}', standardsText);
  return prompt;
}

// ============================================================
// V2.0 第2步：逐项分析（通过云函数代理）
// ============================================================
function callAIAnalysis(filePath, config, areaKey, itemIds, deviceContext, sampleScope) {
  var systemPrompt = buildAnalysisPrompt(areaKey, itemIds);
  var userPrompt = '施工构件定位：' + (deviceContext || '待现场复核') + '。请对当前【' + getAreaName(areaKey) + '】部位的照片进行逐项安装质量检查分析。' +
    '对照检查标准逐项给出判断（normal/abnormal/uncertain），并标注缺陷位置和置信度。';

  return compressImageBeforeUpload(filePath, 1280).then(function (compressed) {
    return uploadToCloud(compressed, 'ai-images');
  }).then(function (fileID) {
    return callCloudFunction({
      analysisType: 'analysis',
      endpoint: config.endpoint,
      model: config.model,
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      imageFileID: fileID,
      areaKey: areaKey || '',
      projectId: sampleScope && sampleScope.projectId || '',
      deviceNodeId: sampleScope && sampleScope.deviceNodeId || '',
      inspectionItemId: sampleScope && sampleScope.inspectionItemId || (itemIds && itemIds[0]) || '',
      maxTokens: 3000,
      temperature: 0.3
    });
  }).then(function (result) {
    return result.data;
  });
}

// ============================================================
// V1.0 兼容：统一AI视觉分析接口（内部使用2-step流程）
// 签名保持兼容，areaKey 为可选参数
// ============================================================
function callAIVision(filePath, systemPrompt, userPrompt, config, areaKey) {
  // V2.0: 如果提供了 areaKey，使用新的2-step流程
  if (areaKey && systemPrompt && systemPrompt.indexOf('{STANDARDS_PLACEHOLDER}') !== -1) {
    // 新的逐项分析流程
    var builtPrompt = buildAnalysisPrompt(areaKey);
    var builtUser = '请对当前【' + getAreaName(areaKey) + '】部位的照片进行逐项安装质量检查。';

    return compressImageBeforeUpload(filePath, 1280).then(function (compressed) {
      return uploadToCloud(compressed, 'ai-images');
    }).then(function (fileID) {
      return callCloudFunction({
        analysisType: 'analysis',
        endpoint: config.endpoint,
        model: config.model,
        systemPrompt: builtPrompt,
        userPrompt: builtUser,
        imageFileID: fileID,
        areaKey: areaKey,
        maxTokens: 3000,
        temperature: 0.3
      });
    }).then(function (result) {
      return result.data;
    });
  }

  // V1.0 兼容：使用传入的提示词
  return compressImageBeforeUpload(filePath, 1280).then(function (compressed) {
    return uploadToCloud(compressed, 'ai-images');
  }).then(function (fileID) {
    return callCloudFunction({
      analysisType: 'analysis',
      endpoint: config.endpoint,
      model: config.model,
      systemPrompt: systemPrompt || '',
      userPrompt: userPrompt || '请分析这张照片中的安装质量缺陷。',
      imageFileID: fileID,
      areaKey: areaKey || '',
      maxTokens: 2000,
      temperature: 0.3
    });
  }).then(function (result) {
    return result.data;
  });
}

// ============================================================
// 辅助函数
// ============================================================

function getAreaName(areaKey) {
  for (var i = 0; i < areaOptions.length; i++) {
    if (areaOptions[i].key === areaKey) return areaOptions[i].name;
  }
  return areaKey || '未知部位';
}

function getSeverityCN(severity) {
  var map = { major: '严重', moderate: '一般', minor: '轻微' };
  return map[severity] || severity;
}

function getSeverityName(severity) {
  return getSeverityCN(severity);
}

function getSeverityColor(severity) {
  var map = { major: '#FA5151', moderate: '#FFC300', minor: '#10AEFF' };
  return map[severity] || '#FA5151';
}

function getTypeName(type) {
  var map = {
    weld: '焊缝缺陷', seal: '密封不良', corrosion: '防腐问题', dimension: '尺寸偏差',
    alignment: '平整度问题', tension: '张紧度不足', spacing: '间距不符',
    damage: '损伤变形', install: '安装偏差', missing: '部件遗漏', other: '其他'
  };
  return map[type] || type || '其他';
}

// 工程建设期检查方式分类。只有可从照片直接观察的项目允许AI给出质量结论；
// 尺寸、试验和资料类项目必须由现场人员提供相应证据。
function getInspectionMethod(item) {
  item = item || {};
  var text = [item.title, item.desc, item.standard, item.keyPoints, item.normalDesc, item.abnormalDesc, item.visualCues]
    .filter(Boolean).join(' ');

  if (/煤油|渗油|气密|密封性试验|水压|通电试验|绝缘试验|试运|试验记录/.test(text)) {
    return { key: 'instrument_test', name: '试验核验', aiApplicable: false, evidenceHint: '需要上传试验记录、仪表读数或试验过程照片，由人工确认结论。' };
  }
  if (/合格证|材质证明|质量证明|检验报告|施工记录|验收记录|图纸会审|资料核查|文件核查/.test(text)) {
    return { key: 'document_review', name: '资料核验', aiApplicable: false, evidenceHint: '需要核验图纸、合格证、检验报告或施工记录。' };
  }
  if (/\bmm\b|毫米|±|偏差|尺寸|间距|垂直度|水平度|标高|对角线|中心线|同轴度|力矩|扭矩|张紧力|塞尺|测量|实测|焊缝高度|焊脚高度/.test(text)) {
    return { key: 'manual_measurement', name: '人工测量', aiApplicable: false, evidenceHint: '需要录入量具读数或实测值，照片只能作为辅助证据。' };
  }
  return { key: 'visual_ai', name: '视觉AI', aiApplicable: true, evidenceHint: '可通过清晰的全景和细节照片辅助判断，最终结论仍需人工复核。' };
}

function formatDate() {
  var d = new Date();
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function formatDateTime() {
  var d = new Date();
  return d.toLocaleString('zh-CN');
}

// ============================================================
// Demo 缺陷（保留V1.0兼容）
// ============================================================
function getDemoDefects(area) {
  var demoMap = {
    shell: {
      defects: [
        { id: 1, itemId: 's3', type: 'weld', name: '中部承压件三面焊遗漏', severity: 'major', confidence: 0.92, description: '壳体中部承压件焊缝高度不足，三面焊有一面遗漏。该处为常见缺陷高发部位。', bbox: {x:0.35,y:0.3,w:0.2,h:0.15}, location_hint: 'center', standard: 'GB 50661', suggestion: '对遗漏焊缝进行补焊，确保三面焊接完整。焊接前清理焊面杂物。' },
        { id: 2, itemId: 's12', type: 'missing', name: '斜拉筋焊接不全', severity: 'moderate', confidence: 0.85, description: '壳体斜拉筋节点板处焊缝不完整，未达到三面焊接要求。', bbox: {x:0.65,y:0.15,w:0.15,h:0.12}, location_hint: 'top-right', standard: 'GB 50661', suggestion: '对斜拉筋节点板补齐三面焊接。' },
        { id: 3, itemId: 's16', type: 'dimension', name: '墙板立柱对角线超差', severity: 'minor', confidence: 0.78, description: '壳体墙板与宽立柱拼装组合后，对角线偏差超过±5mm允许范围。', bbox: {x:0.1,y:0.65,w:0.2,h:0.15}, location_hint: 'bottom-left', standard: 'GB 50205', suggestion: '重新校正墙板立柱位置。' }
      ],
      itemResults: [
        { itemId: 's1', status: 'normal', confidence: 0.88, reason: '斜管撑焊缝完整可见' },
        { itemId: 's3', status: 'abnormal', confidence: 0.92, reason: '三面焊有一面遗漏', defectId: 1 },
        { itemId: 's12', status: 'abnormal', confidence: 0.85, reason: '焊接面数不足', defectId: 2 },
        { itemId: 's16', status: 'abnormal', confidence: 0.78, reason: '对角线偏差超标', defectId: 3 }
      ],
      overall_assessment: '壳体焊接质量需重点整改，承压件和斜拉筋焊缝存在遗漏。', quality_score: 65, safety_notes: '高处焊接作业需系好安全带，配备灭火器材。'
    },
    ashopper: {
      defects: [
        { id: 1, itemId: 'a3', type: 'seal', name: '灰斗焊缝密封不良', severity: 'major', confidence: 0.90, description: '灰斗焊缝处发现渗漏痕迹，煤油渗油法检查发现多处漏点。', bbox: {x:0.3,y:0.35,w:0.25,h:0.18}, location_hint: 'center', standard: 'GB 50236', suggestion: '对漏点位置进行补焊，重新进行煤油渗油法检验。' },
        { id: 2, itemId: 'a5', type: 'damage', name: '外部加强筋被切割未补回', severity: 'major', confidence: 0.95, description: '灰斗外壁加强筋在安装时被切割后未补回，严重破坏结构强度。', bbox: {x:0.15,y:0.2,w:0.2,h:0.15}, location_hint: 'top-left', standard: 'GB 50205', suggestion: '立即补回被切割的加强筋段，互相搭接焊接牢固。' },
        { id: 3, itemId: 'a8', type: 'install', name: '管撑偏位且缝隙未封堵', severity: 'moderate', confidence: 0.82, description: '灰斗管撑布置偏边，缝隙未封堵，降低了管撑强度。', bbox: {x:0.6,y:0.6,w:0.18,h:0.14}, location_hint: 'bottom-right', standard: 'GB 50661', suggestion: '调整管撑位置使其与壁板外部主筋对应，缝隙用焊材封堵。' }
      ],
      itemResults: [
        { itemId: 'a3', status: 'abnormal', confidence: 0.90, reason: '焊缝渗漏', defectId: 1 },
        { itemId: 'a5', status: 'abnormal', confidence: 0.95, reason: '加强筋被切割', defectId: 2 }
      ],
      overall_assessment: '灰斗安装存在严重结构隐患，加强筋被切割和焊缝密封性问题须优先整改。', quality_score: 55, safety_notes: '灰斗内部作业注意通风，防止焊接烟尘中毒。'
    }
  };

  // 没有专门演示数据的专业不再错误回退为“壳体缺陷”。
  if (!demoMap[area]) {
    var areaData = standardsDetail[area];
    var visibleItems = areaData ? areaData.items.filter(function (item) {
      return getInspectionMethod(item).aiApplicable;
    }).slice(0, 3) : [];
    return {
      defects: [],
      itemResults: visibleItems.map(function (item) {
        return { itemId: item.id, status: 'normal', confidence: 0.88, reason: '演示数据：画面中未发现明显外观异常' };
      }),
      overall_assessment: '演示模式结果，仅用于界面体验，不作为工程质量记录。',
      quality_score: 92,
      safety_notes: '正式检查请关闭演示模式，并由现场质量人员复核。'
    };
  }
  return demoMap[area];
}

module.exports = {
  // V2.0 新接口
  callAIQualityCheck: callAIQualityCheck,
  callAIAnalysis: callAIAnalysis,
  buildStandardsText: buildStandardsText,
  buildAnalysisPrompt: buildAnalysisPrompt,
  uploadToCloud: uploadToCloud,
  compressImageBeforeUpload: compressImageBeforeUpload,
  getAreaName: getAreaName,
  getSeverityCN: getSeverityCN,
  // V1.0 兼容接口
  callAIVision: callAIVision,
  getSeverityName: getSeverityName,
  getSeverityColor: getSeverityColor,
  getTypeName: getTypeName,
  getInspectionMethod: getInspectionMethod,
  formatDate: formatDate,
  formatDateTime: formatDateTime,
  getDemoDefects: getDemoDefects,
  areaOptions: areaOptions,
  checklistData: checklistData,
  standardsDetail: standardsDetail
};
