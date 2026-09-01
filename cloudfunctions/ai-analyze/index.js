// cloudfunctions/ai-analyze/index.js
// V2.0 AI Vision API 云函数
// 支持两种 analysisType:
//   'quality' — 照片质量检测 + 部位识别（轻量级）
//   'analysis' — 逐项安装质量检查分析（完整分析）

const cloud = require('wx-server-sdk');
const axios = require('axios');

const RUNTIME_VERSION = '2026.08.03-ai-v2.2';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ============================================================
// 查询历史缺陷样本（确认缺陷 → 正样本）
// ============================================================
function rankSamples(samples, scope, limit) {
  scope = scope || {};
  return (samples || []).map(function (sample) {
    var score = 0;
    if (scope.projectId && sample.projectId === scope.projectId) score += 12;
    else if (scope.projectId && sample.projectId) score -= 20;
    if (scope.deviceNodeId && sample.deviceNodeId === scope.deviceNodeId) score += 8;
    if (scope.inspectionItemId && sample.inspectionItemId === scope.inspectionItemId) score += 6;
    return { sample: sample, score: score };
  }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit).map(function (x) { return x.sample; });
}

async function getSampleContext(areaKey, limit, scope) {
  if (!areaKey) return '';
  try {
    const db = cloud.database();
    const _ = db.command;
    var samples = [];
    try {
      var res = await db.collection('defect-samples')
        .where({ area: areaKey })
        .orderBy('createTime', 'desc')
        .limit(30)
        .get();
      samples = res.data || [];
    } catch (e) { samples = []; }

    samples = rankSamples(samples, scope, limit);

    if (samples.length === 0) {
      return '（暂无历史样本。随着用户确认更多缺陷，AI将参考历史样本越用越精准。）';
    }

    var lines = samples.map(function (s, i) {
      return '样本' + (i + 1) + '【' + (s.areaName || s.area) + '】' +
        (s.name || '') + '（' + (s.severityName || s.severity || '') + '）：' +
        (s.description || '') +
        (s.standard ? '，标准：' + s.standard : '');
    });
    return '已积累 ' + samples.length + ' 个确认样本：\n' + lines.join('\n');
  } catch (err) {
    console.error('查询样本库失败:', err);
    return '';
  }
}

// ============================================================
// V2.0 查询误报案例（避免重复误报）
// ============================================================
async function getFalsePositiveContext(areaKey, limit, scope) {
  if (!areaKey) return '';
  try {
    const db = cloud.database();
    var res = await db.collection('false-positives')
      .where({ area: areaKey })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get();
    var samples = rankSamples(res.data || [], scope, limit || 3);
    if (samples.length === 0) return '';

    var lines = samples.map(function (s, i) {
      return '误报' + (i + 1) + '：' + (s.name || '') + ' — 原因：' + (s.falsePositiveReason || 'AI误判');
    });
    return '\n【注意：以下是过去的误报案例，请避免重复误报】\n' + lines.join('\n');
  } catch (err) {
    return '';
  }
}

// V3.0: inject confirmed missed defects so recurring blind spots become visible to AI.
async function getMissedDefectContext(areaKey, limit, scope) {
  if (!areaKey) return '';
  try {
    const db = cloud.database();
    var res = await db.collection('missed-defects')
      .where({ area: areaKey })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get();
    var samples = rankSamples(res.data || [], scope, limit || 3);
    if (!samples.length) return '';
    var lines = samples.map(function (s, i) {
      return '漏检' + (i + 1) + '：' + (s.name || '') + ' — ' + (s.description || '用户人工补录');
    });
    return '\n【注意：以下缺陷曾被AI漏检，请重点核查】\n' + lines.join('\n');
  } catch (err) {
    return '';
  }
}

function validateEndpoint(endpoint) {
  try {
    var parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return false;
    var host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function clamp(value, min, max) { value = Number(value); if (!Number.isFinite(value)) value = min; return Math.max(min, Math.min(max, value)); }
function text(value, max) { return typeof value === 'string' ? value.slice(0, max || 1000) : ''; }
function normalizeAIResult(result, analysisType) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('AI JSON根节点必须是对象');
  if (analysisType === 'quality') {
    var q = result.quality && typeof result.quality === 'object' ? result.quality : {};
    var quality = {
      clarity: ['clear','blurry'].indexOf(q.clarity) >= 0 ? q.clarity : 'blurry',
      exposure: ['normal','under','over'].indexOf(q.exposure) >= 0 ? q.exposure : 'normal',
      distance: ['ok','too_far','too_close'].indexOf(q.distance) >= 0 ? q.distance : 'too_far',
      obstruction: ['none','partial','severe'].indexOf(q.obstruction) >= 0 ? q.obstruction : 'partial',
      angle: ['normal','abnormal'].indexOf(q.angle) >= 0 ? q.angle : 'abnormal',
      usable: q.usable === true,
      qualityMessage: text(q.qualityMessage, 300)
    };
    var areas = ['shell','ashopper','anode','cathode','rapping','support','horn','hoist','hvline','unknown'];
    return { schemaVersion: 'ai-quality-v1', quality: quality, detectedArea: areas.indexOf(result.detectedArea) >= 0 ? result.detectedArea : 'unknown', areaConfidence: clamp(result.areaConfidence, 0, 1), areaDescription: text(result.areaDescription, 300) };
  }
  var statuses = ['normal','abnormal','uncertain'];
  var severities = ['major','moderate','minor'];
  var types = ['weld','seal','corrosion','dimension','alignment','tension','spacing','damage','install','missing','other'];
  var itemResults = Array.isArray(result.itemResults) ? result.itemResults.slice(0, 100).map(function (item) {
    item = item || {}; return { itemId: text(item.itemId, 80), status: statuses.indexOf(item.status) >= 0 ? item.status : 'uncertain', confidence: clamp(item.confidence, 0, 1), reason: text(item.reason, 500), defectId: item.defectId == null ? null : item.defectId };
  }).filter(function (item) { return !!item.itemId; }) : [];
  var defects = Array.isArray(result.defects) ? result.defects.slice(0, 50).map(function (d, index) {
    d = d || {}; var bbox = d.bbox && typeof d.bbox === 'object' ? d.bbox : null;
    return { id: index + 1, itemId: text(d.itemId, 80), type: types.indexOf(d.type) >= 0 ? d.type : 'other', name: text(d.name, 160), severity: severities.indexOf(d.severity) >= 0 ? d.severity : 'moderate', confidence: clamp(d.confidence, 0, 1), description: text(d.description, 1000), bbox: bbox ? { x: clamp(bbox.x,0,1), y: clamp(bbox.y,0,1), w: clamp(bbox.w,0,1), h: clamp(bbox.h,0,1) } : null, location_hint: text(d.location_hint, 200), standard: text(d.standard, 300), suggestion: text(d.suggestion, 1000) };
  // Some vision models omit itemId for an otherwise valid visible defect.
  // Keep named candidates here; the selected inspection item is applied after
  // normalization so valid detections are not silently discarded.
  }).filter(function (d) { return !!d.name; }) : [];
  var analysisQ = result.quality && typeof result.quality === 'object' ? result.quality : {};
  var analysisQuality = {
    clarity: ['clear','blurry'].indexOf(analysisQ.clarity) >= 0 ? analysisQ.clarity : 'blurry',
    exposure: ['normal','under','over'].indexOf(analysisQ.exposure) >= 0 ? analysisQ.exposure : 'normal',
    distance: ['ok','too_far','too_close'].indexOf(analysisQ.distance) >= 0 ? analysisQ.distance : 'too_far',
    obstruction: ['none','partial','severe'].indexOf(analysisQ.obstruction) >= 0 ? analysisQ.obstruction : 'partial',
    angle: ['normal','abnormal'].indexOf(analysisQ.angle) >= 0 ? analysisQ.angle : 'abnormal',
    usable: analysisQ.usable === true,
    qualityMessage: text(analysisQ.qualityMessage, 300)
  };
  var analysisAreas = ['shell','ashopper','anode','cathode','rapping','support','horn','hoist','hvline','unknown'];
  return {
    schemaVersion: 'ai-analysis-v2',
    quality: analysisQuality,
    detectedArea: analysisAreas.indexOf(result.detectedArea) >= 0 ? result.detectedArea : 'unknown',
    areaConfidence: clamp(result.areaConfidence, 0, 1),
    areaDescription: text(result.areaDescription, 300),
    itemResults: itemResults,
    defects: defects,
    overall_assessment: text(result.overall_assessment, 1200),
    ai_quality_score: clamp(result.quality_score, 0, 100),
    quality_score: clamp(result.quality_score, 0, 100),
    safety_notes: text(result.safety_notes, 1000)
  };
}

// ============================================================
// 从云存储下载图片并转为 base64 data URI
// 图片压缩在小程序端上传前完成（canvas压缩），云函数只负责下载转base64
// ============================================================
async function downloadImageAsBase64(fileID) {
  // 第一步：获取临时下载链接
  var urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
  var fileInfo = urlRes.fileList && urlRes.fileList[0];
  if (!fileInfo || fileInfo.status !== 0 || !fileInfo.tempFileURL) {
    var errMsg = (fileInfo && fileInfo.status !== 0) ? ('状态码: ' + fileInfo.status) : '未获取到临时链接';
    throw new Error('获取图片临时链接失败（' + errMsg + '），fileID: ' + fileID);
  }

  var downloadUrl = fileInfo.tempFileURL;

  // 第二步：通过HTTP下载图片
  var buffer = await new Promise(function (resolve, reject) {
    var lib = downloadUrl.startsWith('https') ? require('https') : require('http');
    lib.get(downloadUrl, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        lib.get(res.headers.location, function (res2) {
          _collectChunks(res2, resolve, reject);
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('图片下载HTTP状态码异常: ' + res.statusCode));
        return;
      }
      _collectChunks(res, resolve, reject);
    }).on('error', reject);
  });

  if (!buffer || buffer.length === 0) {
    throw new Error('图片HTTP下载内容为空，fileID: ' + fileID);
  }

  var base64 = buffer.toString('base64');
  return 'data:image/jpeg;base64,' + base64;
}

function _collectChunks(res, resolve, reject) {
  var chunks = [];
  res.on('data', function (chunk) { chunks.push(chunk); });
  res.on('end', function () { resolve(Buffer.concat(chunks)); });
  res.on('error', reject);
}

// ============================================================
// 云函数入口
// ============================================================
exports.main = async (event, context) => {
  const {
    action, endpoint, model,
    systemPrompt, userPrompt, imageFileID,
    areaKey, analysisType, projectId, deviceNodeId, inspectionItemId,
    maxTokens = 2000, temperature = 0.3
  } = event;

  var effectiveEndpoint = process.env.ESP_AI_ENDPOINT || endpoint;
  // Secrets must stay in the cloud-function environment and are never accepted from the Mini Program client.
  var effectiveApiKey = process.env.ESP_AI_API_KEY || '';
  var effectiveModel = process.env.ESP_AI_MODEL || model || 'qwen-vl-max';

  // Read-only readiness probe. Never returns endpoint values or secret content.
  if (action === 'status') {
    return {
      success: true,
      configured: !!(effectiveEndpoint && effectiveApiKey),
      endpointConfigured: !!effectiveEndpoint,
      apiKeyConfigured: !!effectiveApiKey,
      modelConfigured: !!effectiveModel,
      source: process.env.ESP_AI_ENDPOINT ? 'cloud' : 'client-fallback',
      runtimeVersion: RUNTIME_VERSION,
      schemaVersion: 'ai-analysis-v2'
    };
  }

  if (!effectiveEndpoint || !effectiveApiKey) {
    return { success: false, error: '缺少 API 地址或 API Key' };
  }
  if (!validateEndpoint(effectiveEndpoint)) {
    return { success: false, error: 'AI API 地址无效或不符合安全策略（必须使用公网 HTTPS）' };
  }
  if (!imageFileID) {
    return { success: false, error: '缺少图片 fileID' };
  }

  try {
    // Step 1: 下载图片（压缩已在小程序端完成）
    console.log('[ai-analyze] 下载图片:', imageFileID);
    var imageBase64 = await downloadImageAsBase64(imageFileID);
    console.log('[ai-analyze] 图片下载完成, base64长度:', imageBase64.length);

    // Step 2: 构建最终提示词
    var finalSystemPrompt = systemPrompt || '你是一位专业的质量检查专家。';

    // 注入样本上下文（仅对 analysis 类型）
    if (analysisType !== 'quality' && areaKey) {
      // 注入缺陷样本
      if (finalSystemPrompt.indexOf('{SAMPLES_PLACEHOLDER}') !== -1) {
        var retrievalScope = { projectId: projectId || '', deviceNodeId: deviceNodeId || '', inspectionItemId: inspectionItemId || '' };
        var sampleContext = await getSampleContext(areaKey, 5, retrievalScope);
        finalSystemPrompt = finalSystemPrompt.replace('{SAMPLES_PLACEHOLDER}', sampleContext);
      }
      // V2.0: 注入误报上下文
      var fpContext = await getFalsePositiveContext(areaKey, 3, retrievalScope);
      if (fpContext) {
        finalSystemPrompt = finalSystemPrompt + '\n' + fpContext;
      }
      var missedContext = await getMissedDefectContext(areaKey, 3, retrievalScope);
      if (missedContext) finalSystemPrompt = finalSystemPrompt + '\n' + missedContext;
    }

    // 如果还有未替换的占位符，清除它们
    finalSystemPrompt = finalSystemPrompt
      .replace('{SAMPLES_PLACEHOLDER}', '（暂无历史样本）')
      .replace('{STANDARDS_PLACEHOLDER}', '');

    // Step 3: 构建请求
    // 当前微信云函数运行环境最长 60 秒。限制输出长度可显著降低视觉模型
    // 首 token 后的生成时间，并为图片下载和结果解析预留足够时间。
    var effectiveMaxTokens = analysisType === 'quality'
      ? Math.min(Number(maxTokens) || 500, 500)
      : Math.min(Number(maxTokens) || 1800, 1800);
    var apiTimeoutMs = analysisType === 'quality' ? 35000 : 45000;

    const requestBody = {
      model: effectiveModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt || '请分析这张照片。' },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      max_tokens: effectiveMaxTokens,
      temperature: temperature
    };

    // Step 4: 调用 AI API。必须明显短于云函数 60 秒上限，否则函数会在
    // catch 返回结构化错误之前被平台强制终止。
    console.log('[ai-analyze] 调用AI:', effectiveEndpoint, 'model:', effectiveModel, 'type:', analysisType);
    const response = await axios({
      method: 'POST',
      url: effectiveEndpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + effectiveApiKey
      },
      data: requestBody,
      timeout: apiTimeoutMs
    });

    console.log('[ai-analyze] AI返回成功');
    var finishReason = response.data?.choices?.[0]?.finish_reason || 'unknown';
    const content = response.data?.choices?.[0]?.message?.content || '';
    console.log('[ai-analyze] finish_reason:', finishReason, '内容长度:', content.length);
    console.log('[ai-analyze] AI原始返回前300字:', content.slice(0, 300));

    // 提取JSON：优先从markdown代码块中提取
    var jsonStr = '';
    var codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // 贪婪匹配最外层大括号
      var braceMatch = content.match(/\{[\s\S]*\}/);
      if (braceMatch) jsonStr = braceMatch[0];
    }

    if (!jsonStr) {
      console.warn('[ai-analyze] 未找到JSON，原始返回:', content.slice(0, 500));
      return {
        success: false,
        error: 'AI 返回格式异常，无法解析结果',
        rawContent: content.slice(0, 500)
      };
    }

    var result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      // 尝试修复截断的JSON：补全缺失的括号
      console.warn('[ai-analyze] JSON解析失败，尝试修复。原始:', jsonStr.slice(0, 200));
      var fixed = jsonStr;
      // 先尝试补全数组括号
      var openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
      // 截断到最后一个完整字段（去掉尾部逗号和不完整的key-value）
      fixed = fixed.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
      while (openBrackets > 0) { fixed += ']'; openBrackets--; }
      var openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
      while (openBraces > 0) { fixed += '}'; openBraces--; }
      try {
        result = JSON.parse(fixed);
        console.log('[ai-analyze] JSON修复成功');
      } catch (e2) {
        console.warn('[ai-analyze] JSON修复失败:', fixed.slice(0, 300));
        return {
          success: false,
          error: 'AI 返回的JSON数据不完整，请重试',
          rawContent: content.slice(0, 500)
        };
      }
    }
    result = normalizeAIResult(result, analysisType);
    result.runtimeVersion = RUNTIME_VERSION;
    if (analysisType !== 'quality' && inspectionItemId) {
      result.defects.forEach(function (defect) {
        if (!defect.itemId) defect.itemId = inspectionItemId;
      });
    }
    return {
      success: true,
      data: result,
      schemaVersion: result.schemaVersion,
      runtimeVersion: RUNTIME_VERSION
    };

  } catch (err) {
    console.error('[ai-analyze] 错误:', err.message || err);
    if (err.response) {
      return {
        success: false,
        error: 'API 返回错误 (' + err.response.status + '): ' + JSON.stringify(err.response.data).slice(0, 300),
        statusCode: err.response.status
      };
    } else if (err.code === 'ECONNABORTED') {
      return { success: false, error: 'AI API 请求超时（' + Math.round(apiTimeoutMs / 1000) + '秒），请检查模型服务和云函数网络后重试' };
    } else {
      return { success: false, error: '请求失败: ' + (err.message || '未知错误') };
    }
  }
};
