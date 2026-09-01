// utils/data.js - V2.0 ESP inspection data, prompts, and standards
var standardsDetail = require('./standards-detail.js').standardsDetail;
var v3Data = require('./v3-data.js');

// ============================================================
// checklistData — 从 standards-detail 构建，保持向后兼容
// ============================================================
var checklistData = {};
var keys = Object.keys(standardsDetail);
for (var i = 0; i < keys.length; i++) {
  var k = keys[i];
  var area = standardsDetail[k];
  checklistData[k] = {
    name: area.name,
    icon: area.icon,
    tip: area.tip,
    sourceDocument: (v3Data.STANDARD_SOURCES[k] || {}).document || '',
    constructionStageId: (v3Data.STANDARD_SOURCES[k] || {}).stageId || '',
    scope: (v3Data.STANDARD_SOURCES[k] || {}).scope || '',
    items: area.items.map(function (item) {
      return {
        id: item.id,
        title: item.title,
        desc: item.keyPoints,
        standard: item.standard,
        severity: item.severity,
        normalDesc: item.normalDesc,
        abnormalDesc: item.abnormalDesc,
        suggestion: item.suggestion,
        visualCues: item.visualCues
        ,sourceDocument: (v3Data.STANDARD_SOURCES[k] || {}).document || ''
        ,constructionStageId: (v3Data.STANDARD_SOURCES[k] || {}).stageId || ''
      };
    })
  };
}

// ============================================================
// areaOptions — 部位列表
// ============================================================
var areaOptions = [
  { key: 'shell', name: '壳体' },
  { key: 'ashopper', name: '灰斗' },
  { key: 'anode', name: '阳极系统' },
  { key: 'cathode', name: '阴极系统' },
  { key: 'rapping', name: '振打系统' },
  { key: 'support', name: '钢支架与支座' },
  { key: 'horn', name: '进出口喇叭' },
  { key: 'hoist', name: '顶部起吊' },
  { key: 'hvline', name: '高压进线' }
];

// ============================================================
// AREA_DETECT_PROMPT — 第1次AI调用：照片质量检测 + 部位识别
// ============================================================
var AREA_DETECT_PROMPT = '低低温电除尘工程建设期安装质量检查。设备总图为G760.0双室五电场。仅输出JSON，不要任何解释文字。\n' +
  '识别照片质量(clarity:clear/blurry,exposure:normal/under/over,distance:ok/too_far/too_close,obstruction:none/partial/severe,angle:normal/abnormal,usable:true/false,qualityMessage:中文建议)和部位(shell壳体/ashopper灰斗/anode阳极/cathode阴极/rapping振打/support钢支架/horn喇叭/hoist起吊/hvline高压进线/unknown)。角度明显倾斜、关键连接面不可见时angle=abnormal且usable=false。\n' +
  '输出：{"quality":{"clarity":"","exposure":"","distance":"","obstruction":"","angle":"","usable":true,"qualityMessage":""},"detectedArea":"","areaConfidence":0.9,"areaDescription":""}';

// ============================================================
// AI_SYSTEM_PROMPT — 第2次AI调用：逐项检查分析（V2.0）
// {STANDARDS_PLACEHOLDER} = 当前部位的结构化检查标准
// {SAMPLES_PLACEHOLDER} = 历史确认缺陷样本
// ============================================================
var AI_SYSTEM_PROMPT = [
  '你是低低温电除尘工程建设期安装质量检查专家。对象为G760.0双室五电场ESP，不是运行维护诊断。仅输出JSON，不要任何解释文字。',
  '判断必须落到室别(A/B室)、第1至第5电场、构件系统、排/列/轴线或灰斗编号；无法从画面确认的位置标为待现场复核。',
  '标准来源为项目安装质量检查文件：壳体、灰斗、进出口喇叭、阳极系统、阴极框架组合、阴极系统、振打系统、支座、钢支架、顶部起吊、高压进线。',
  '【重要】先仔细观察照片中实际可见的内容，再逐项判断。',
  '只报告在照片中清晰可见的缺陷。只有关键验收特征清晰可见且符合标准时才标为normal；看不清、被遮挡、需要尺寸测量/仪器试验/资料核验时必须标为uncertain，不得推定为合格。',
  '不要基于推测或想象报告缺陷。confidence<0.6不报告；不得仅凭单张照片判断尺寸偏差、扭矩、标高、垂直度、密封试验或其他不可视指标。',
  '当前检查项是主要判断范围；但照片中若存在清晰可见的锈蚀、涂层脱落、构件缺失、明显变形或焊缝缺陷，不得因名称与当前检查项不完全相同而忽略，应作为补充视觉缺陷返回并说明位置。',
  'bbox坐标为0-1比例值：x,y是左上角，w,h是宽高比例。',
  '',
  '检查标准：',
  '{STANDARDS_PLACEHOLDER}',
  '',
  '参考样本：',
  '{SAMPLES_PLACEHOLDER}',
  '',
  '同时判断照片质量与所拍部位；照片不清楚时将相关检查项标为uncertain，但仍返回完整JSON。',
  '输出JSON：',
  '{"quality":{"clarity":"clear/blurry","exposure":"normal/under/over","distance":"ok/too_far/too_close","obstruction":"none/partial/severe","angle":"normal/abnormal","usable":true,"qualityMessage":""},"detectedArea":"shell/ashopper/anode/cathode/rapping/support/horn/hoist/hvline/unknown","areaConfidence":0.9,"areaDescription":"","itemResults":[{"itemId":"","status":"normal/abnormal/uncertain","confidence":0.9,"reason":"","defectId":null}],"defects":[{"id":1,"itemId":"","type":"weld/seal/corrosion/dimension/alignment/tension/spacing/damage/install/missing/other","name":"","severity":"major/moderate/minor","confidence":0.9,"description":"","bbox":{"x":0,"y":0,"w":0.1,"h":0.1},"location_hint":"","standard":"","suggestion":""}],"overall_assessment":"","quality_score":80,"safety_notes":""}',
  '正常安装标normal。仅当缺陷清晰可见时才标abnormal。'
].join('\n');

module.exports = {
  checklistData: checklistData,
  standardsDetail: standardsDetail,
  areaOptions: areaOptions,
  AREA_DETECT_PROMPT: AREA_DETECT_PROMPT,
  AI_SYSTEM_PROMPT: AI_SYSTEM_PROMPT
};
