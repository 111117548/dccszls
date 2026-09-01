// cloudfunctions/generate-report/index.js
// V2.0 ESP安装质量检查整改报告 — Word文档生成云函数
// 接收检查数据 + 照片fileID → 生成.docx → 上传云存储 → 返回fileID

const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  TableLayoutType,
  ShadingType,
  VerticalAlign,
  PageBreak
} = require('docx');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ============================================================
// Constants
// ============================================================
var SEVERITY_MAP = {
  major: { name: '严重', color: 'CC0000' },
  moderate: { name: '一般', color: 'CC6600' },
  minor: { name: '轻微', color: '006699' }
};

var NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
var NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
var THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
var TABLE_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

// ============================================================
// Helper: Download file from URL to Buffer
// ============================================================
function downloadToBuffer(url) {
  return new Promise(function (resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    lib.get(url, function (res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        lib.get(res.headers.location, function (res2) {
          _collectBuffer(res2, resolve, reject);
        }).on('error', reject);
        return;
      }
      _collectBuffer(res, resolve, reject);
    }).on('error', reject);
  });
}

function _collectBuffer(res, resolve, reject) {
  var chunks = [];
  res.on('data', function (chunk) { chunks.push(chunk); });
  res.on('end', function () { resolve(Buffer.concat(chunks)); });
  res.on('error', reject);
}

// ============================================================
// Helper: Download photo buffers from cloud fileIDs
// ============================================================
async function getPhotoBuffers(fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return [];

  try {
    var result = await cloud.getTempFileURL({ fileList: fileIDs });
    var files = result.fileList || [];

    var buffers = await Promise.all(files.map(function (f) {
      if (f.status !== 0 || !f.tempFileURL) {
        return Promise.resolve(null);
      }
      return downloadToBuffer(f.tempFileURL).catch(function () { return null; });
    }));

    return buffers;
  } catch (err) {
    console.error('获取文件临时链接失败:', err);
    return fileIDs.map(function () { return null; });
  }
}

// ============================================================
// Helper: Build info table (项目信息)
// ============================================================
function buildInfoTable(data) {
  var rows = [
    ['项目名称', data.project || 'ESP安装工程'],
    ['检查日期', data.date || ''],
    ['检查人员', data.inspector || ''],
    ['检查部位', data.area || '全部'],
    ['设备名称', data.device || '低低温电除尘器'],
    ['总图依据', (data.drawingNo || 'G760.0') + ' · ' + (data.layout || '双室五电场')],
    ['项目阶段', data.stage || '安装调试阶段'],
    ['安装质检统计', '检查任务 ' + (data.inspectionCount || 0) + ' 项，质量见证照片 ' + (data.photoCount || 0) + ' 张']
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(function (pair) {
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: TABLE_BORDERS,
            shading: { type: ShadingType.SOLID, fill: 'F0F0F0' },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [new TextRun({ text: pair[0], bold: true, size: 22, font: 'Microsoft YaHei' })]
            })]
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: TABLE_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [new TextRun({ text: pair[1] || '', size: 22, font: 'Microsoft YaHei' })]
            })]
          })
        ]
      });
    })
  });
}

// ============================================================
// Helper: Build defect summary paragraph
// ============================================================
function buildSummaryParagraph(defects, majorCount, moderateCount, minorCount) {
  var total = defects.length;
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({ text: '共发现缺陷 ' + total + ' 项：', size: 22, font: 'Microsoft YaHei' }),
      new TextRun({ text: '严重 ' + majorCount + ' 项', color: SEVERITY_MAP.major.color, bold: true, size: 22, font: 'Microsoft YaHei' }),
      new TextRun({ text: '，一般 ' + moderateCount + ' 项', color: SEVERITY_MAP.moderate.color, bold: true, size: 22, font: 'Microsoft YaHei' }),
      new TextRun({ text: '，轻微 ' + minorCount + ' 项', color: SEVERITY_MAP.minor.color, bold: true, size: 22, font: 'Microsoft YaHei' }),
      new TextRun({ text: '。', size: 22, font: 'Microsoft YaHei' })
    ]
  });
}

// ============================================================
// Helper: Build defects detail table
// ============================================================
function buildDefectsTable(defects) {
  // Header row
  var headerTexts = ['序号', '设备/系统', '空间位置', '缺陷名称', '等级', 'AI置信度', '整改状态', '整改建议'];
  var headerWidths = [5, 14, 12, 15, 8, 9, 10, 27];

  var headerRow = new TableRow({
    tableHeader: true,
    children: headerTexts.map(function (text, i) {
      return new TableCell({
        width: { size: headerWidths[i], type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS,
        shading: { type: ShadingType.SOLID, fill: '2B3A67' },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
          children: [new TextRun({ text: text, bold: true, color: 'FFFFFF', size: 20, font: 'Microsoft YaHei' })]
        })]
      });
    })
  });

  // Data rows
  var dataRows = defects.map(function (d, idx) {
    var sevInfo = SEVERITY_MAP[d.severity] || SEVERITY_MAP.moderate;
    var cellData = [
      String(idx + 1),
      ((d.deviceName || '') + (d.systemName ? ' / ' + d.systemName : '')) || '未关联',
      d.positionCode || '待复核',
      d.name || '未知缺陷',
      sevInfo.name,
      d.confidence != null ? Math.round(d.confidence * 100) + '%' : '-',
      d.statusName || d.status || '待整改',
      d.suggestion || ''
    ];

    return new TableRow({
      children: cellData.map(function (text, ci) {
        var opts = {
          borders: TABLE_BORDERS,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: (ci === 0 || ci === 4 || ci === 5 || ci === 6) ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 40, after: 40 },
            children: [new TextRun({
              text: text,
              size: 20,
              font: 'Microsoft YaHei',
              color: ci === 4 ? sevInfo.color : '333333',
              bold: ci === 4
            })]
          })]
        };
        return new TableCell(opts);
      })
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow].concat(dataRows)
  });
}

// ============================================================
// Helper: Build photo documentation pages
// ============================================================
function buildPhotoSection(defects, photoBuffers, defectsByPhoto) {
  var elements = [];

  if (!defectsByPhoto || defectsByPhoto.length === 0) return elements;

  defectsByPhoto.forEach(function (group) {
    var photoIdx = group.photoIdx;
    var groupDefects = group.defects || [];
    var buffer = photoBuffers[photoIdx];

    // Photo page title
    elements.push(new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({
        text: '照片 ' + (photoIdx + 1),
        bold: true,
        size: 28,
        font: 'Microsoft YaHei'
      })]
    }));

    // Embed photo image
    if (buffer && buffer.length > 0) {
      try {
        elements.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new ImageRun({
            data: buffer,
            transformation: { width: 450, height: 338 },
            type: 'jpg'
          })]
        }));
      } catch (imgErr) {
        elements.push(new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: '（照片嵌入失败）', size: 20, color: '999999', font: 'Microsoft YaHei' })]
        }));
      }
    } else {
      elements.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: '（照片下载失败，无法嵌入）', size: 20, color: '999999', font: 'Microsoft YaHei' })]
      }));
    }

    // Defect list under photo
    groupDefects.forEach(function (d) {
      var sevInfo = SEVERITY_MAP[d.severity] || SEVERITY_MAP.moderate;
      elements.push(new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text: '▸ ' + (d.name || '未知'), bold: true, size: 20, font: 'Microsoft YaHei' }),
          new TextRun({ text: '  [' + sevInfo.name + ']', color: sevInfo.color, size: 20, font: 'Microsoft YaHei' })
        ]
      }));
      if (d.suggestion) {
        elements.push(new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({
            text: '  整改建议：' + d.suggestion,
            size: 20,
            color: '336699',
            font: 'Microsoft YaHei'
          })]
        }));
      }
    });

    // Separator
    elements.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  });

  return elements;
}

// ============================================================
// Helper: Build signature section
// ============================================================
function buildSignatureSection() {
  return [
    new Paragraph({ spacing: { before: 400 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                spacing: { before: 600, after: 60 },
                children: [new TextRun({ text: '检查人员签字：______________', size: 22, font: 'Microsoft YaHei' })]
              }),
              new Paragraph({
                children: [new TextRun({ text: '日期：______________', size: 20, color: '666666', font: 'Microsoft YaHei' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                spacing: { before: 600, after: 60 },
                children: [new TextRun({ text: '项目经理签字：______________', size: 22, font: 'Microsoft YaHei' })]
              }),
              new Paragraph({
                children: [new TextRun({ text: '日期：______________', size: 20, color: '666666', font: 'Microsoft YaHei' })]
              })
            ]
          })
        ]
      })]
    })
  ];
}

// ============================================================
// Main: Build the complete Document
// ============================================================
function buildDocument(reportData, defects, majorCount, moderateCount, minorCount, photoBuffers, defectsByPhoto, reportType) {
  var children = [];

  // ---- Title ----
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({
      text: reportType === 'daily' ? '低低温电除尘AI安装质量检查日报' : 'ESP安装质量检查',
      bold: true,
      size: 40,
      font: 'Microsoft YaHei'
    })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({
      text: reportType === 'daily' ? (reportData.date || '') + ' · 项目质量日报' : '整改通知单',
      bold: true,
      size: 36,
      font: 'Microsoft YaHei',
      color: 'CC0000'
    })]
  }));

  // ---- Section 1: Project Info ----
  children.push(new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [new TextRun({
      text: '一、项目信息',
      bold: true,
      size: 28,
      font: 'Microsoft YaHei'
    })]
  }));
  children.push(buildInfoTable(reportData));

  // ---- Section 2: Summary ----
  children.push(new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text: '二、缺陷统计',
      bold: true,
      size: 28,
      font: 'Microsoft YaHei'
    })]
  }));
  children.push(buildSummaryParagraph(defects, majorCount, moderateCount, minorCount));

  // ---- Section 3: Defect Detail Table ----
  children.push(new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text: '三、缺陷明细',
      bold: true,
      size: 28,
      font: 'Microsoft YaHei'
    })]
  }));
  children.push(buildDefectsTable(defects));

  // ---- Section 4: Photo Documentation ----
  var photoSection = buildPhotoSection(defects, photoBuffers, defectsByPhoto);
  if (photoSection.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({
        text: '四、现场照片',
        bold: true,
        size: 28,
        font: 'Microsoft YaHei'
      })]
    }));
    children = children.concat(photoSection);
  }

  // ---- Section 5: Signatures ----
  children.push(new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text: (photoSection.length > 0 ? '五' : '四') + '、签字确认',
      bold: true,
      size: 28,
      font: 'Microsoft YaHei'
    })]
  }));
  var sigElements = buildSignatureSection();
  children = children.concat(sigElements);

  // ---- Build Document ----
  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 }
        }
      },
      children: children
    }]
  });
}

// ============================================================
// Cloud Function Entry
// ============================================================
exports.main = async function (event, context) {
  var reportData = event.reportData || {};
  var reportType = event.reportType || 'rectification';
  var defects = event.defects || [];
  var majorCount = event.majorCount || 0;
  var moderateCount = event.moderateCount || 0;
  var minorCount = event.minorCount || 0;
  var photoFileIDs = event.photoFileIDs || [];

  console.log('报告生成请求: %d项缺陷, %d张照片', defects.length, photoFileIDs.length);

  if (defects.length === 0) {
    return { success: false, error: '没有缺陷数据，无法生成报告' };
  }

  // 1. Download photos
  var photoBuffers = [];
  if (photoFileIDs.length > 0) {
    console.log('下载 %d 张照片...', photoFileIDs.length);
    photoBuffers = await getPhotoBuffers(photoFileIDs);
    var okCount = photoBuffers.filter(function (b) { return b && b.length > 0; }).length;
    console.log('成功下载 %d/%d 张照片', okCount, photoFileIDs.length);
  }

  // 2. Build defectsByPhoto mapping (group defects by photoIdx)
  var defectsByPhoto = [];
  var photoMap = {};
  defects.forEach(function (d) {
    var pi = typeof d.photoIdx === 'number' ? d.photoIdx : 0;
    if (!photoMap[pi]) {
      photoMap[pi] = { photoIdx: pi, defects: [] };
    }
    photoMap[pi].defects.push(d);
  });
  Object.keys(photoMap).forEach(function (k) {
    defectsByPhoto.push(photoMap[k]);
  });
  defectsByPhoto.sort(function (a, b) { return a.photoIdx - b.photoIdx; });

  // 3. Generate Word document
  try {
    var doc = buildDocument(reportData, defects, majorCount, moderateCount, minorCount, photoBuffers, defectsByPhoto, reportType);
    var buffer = await Packer.toBuffer(doc);
    console.log('Word文档生成完成, 大小: %d bytes', buffer.length);

    // 4. Upload to cloud storage
    var timestamp = Date.now();
    var fileName = (reportType === 'daily' ? '低低温电除尘AI安装质量检查日报_' : 'ESP整改报告_') + (reportData.project || '未知项目') + '_' + timestamp + '.docx';
    // Sanitize filename (remove special chars)
    fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');

    var cloudPath = 'reports/' + fileName;
    var uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    });

    console.log('报告已上传: %s', uploadResult.fileID);
    return { success: true, fileID: uploadResult.fileID, fileName: fileName };

  } catch (err) {
    console.error('报告生成失败:', err);
    return {
      success: false,
      error: 'Word文档生成失败: ' + (err.message || String(err))
    };
  }
};
