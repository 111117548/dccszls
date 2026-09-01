// utils/standards-detail.js
// V2.0 结构化检查标准 —— 从PDF安装质量检查资料转换
// 每个检查项包含：keyPoints, normalDesc, abnormalDesc, severity, suggestion, visualCues

const standardsDetail = {
  // ================================================================
  // 壳体 (26项) = 壳体主体(18) + 阻流板(8)
  // ================================================================
  shell: {
    name: '壳体',
    icon: '\uD83C\uDFD7',
    tip: '壳体安装重点：柱脚斜管撑须在灰斗提升前焊完；中部承压件须三面焊；顶梁标高对角线偏差±5mm；接地线每台不少于6根并预留膨胀间隙。',
    items: [
      {
        id: 's1', title: '柱脚斜管撑焊接', standard: 'GB 50661',
        keyPoints: '斜管撑与立柱、下部承压件焊缝须在灰斗提升前焊接完善',
        normalDesc: '斜管撑焊缝完整，灰斗提升前已完成焊接',
        abnormalDesc: '斜管撑焊缝遗漏或不完整，灰斗提升后难以施焊',
        severity: 'major', suggestion: '在灰斗提升前完成所有斜管撑焊接，确保焊缝质量',
        visualCues: '检查斜管撑与立柱、承压件连接处的焊缝完整性'
      },
      {
        id: 's2', title: '斜管撑安装顺序', standard: '设计要求',
        keyPoints: '斜管撑与下部承压件须先拼在一起后再安装',
        normalDesc: '斜管撑与承压件预先拼装后整体安装到位',
        abnormalDesc: '分开安装导致斜管撑无法对位安装',
        severity: 'moderate', suggestion: '先将斜管撑与下部承压件拼装，再整体安装',
        visualCues: '观察斜管撑与承压件的连接是否自然对位'
      },
      {
        id: 's3', title: '中部承压件焊接', standard: 'GB 50661',
        keyPoints: '须三面焊接，焊缝高度不足或遗漏为常见高发缺陷',
        normalDesc: '承压件三面焊接完整，焊缝高度达标',
        abnormalDesc: '焊缝高度不足或某一面遗漏焊接',
        severity: 'major', suggestion: '对遗漏焊缝进行补焊，确保三面焊接完整，焊接前清理焊面',
        visualCues: '重点检查承压件三个焊接面的焊缝高度和连续性'
      },
      {
        id: 's4', title: '接地线安装', standard: 'GB 50169',
        keyPoints: '宽立柱柱脚与支座底板之间接地线预留膨胀间隙，每台不少于6根',
        normalDesc: '接地线数量≥6根，预留膨胀间隙，按图纸布置',
        abnormalDesc: '接地线数量不足或无膨胀间隙',
        severity: 'major', suggestion: '补齐接地线至不少于6根，确保预留膨胀间隙',
        visualCues: '计数接地线数量，检查是否留有膨胀间隙'
      },
      {
        id: 's5', title: '边顶梁与上端板焊接', standard: 'GB 50661',
        keyPoints: '边顶梁与上端板之间的焊缝不得遗漏',
        normalDesc: '边顶梁与上端板焊缝完整无遗漏',
        abnormalDesc: '边顶梁与上端板之间存在未焊接区域',
        severity: 'moderate', suggestion: '检查并补焊遗漏的焊缝',
        visualCues: '沿边顶梁与上端板接缝检查焊缝连续性'
      },
      {
        id: 's6', title: '内部管撑焊接', standard: 'GB 50661',
        keyPoints: '吊装极板前所有管撑焊接必须完成，特别是隔墙管撑焊缝',
        normalDesc: '所有管撑焊缝完成，隔墙管撑焊缝质量合格',
        abnormalDesc: '部分管撑焊缝遗漏或质量不达标',
        severity: 'major', suggestion: '在吊装极板前完成所有管撑焊接并检查质量',
        visualCues: '逐一检查内部管撑焊缝，重点关注隔墙位置'
      },
      {
        id: 's7', title: '顶板中心与绝缘子法兰同心', standard: 'DL/T 514',
        keyPoints: '确保阴极吊杆组件中心和绝缘子法兰中心同心',
        normalDesc: '阴极吊杆组件中心与绝缘子法兰中心同心对齐',
        abnormalDesc: '两者不同心，存在偏移',
        severity: 'major', suggestion: '用正确方法确定法兰中心，调整至同心',
        visualCues: '从上方观察吊杆组件与法兰的同心度'
      },
      {
        id: 's8', title: '下部槽钢内侧翼缘焊接', standard: 'GB 50661',
        keyPoints: '灰斗就位前，下部承压件与柱、隔墙下部与柱焊缝须焊毕',
        normalDesc: '灰斗就位前所有下部焊缝完成，特别是槽钢翼缘内侧',
        abnormalDesc: '灰斗就位后下部焊缝无法施焊，存在遗漏',
        severity: 'major', suggestion: '在灰斗就位前完成所有下部焊缝，包括槽钢翼缘内侧',
        visualCues: '检查灰斗下方区域的焊缝完整性'
      },
      {
        id: 's9', title: '顶梁标高与对角线检测', standard: 'GB 50205',
        keyPoints: '极板吊装前须进行顶梁标高、对角线检测',
        normalDesc: '顶梁标高和对角线偏差在允许范围内（±5mm）',
        abnormalDesc: '标高或对角线偏差超出±5mm',
        severity: 'moderate', suggestion: '重新测量并校正顶梁标高和对角线',
        visualCues: '测量顶梁标高和对角线尺寸'
      },
      {
        id: 's10', title: '阳极振打杆与顶板干涉', standard: 'DL/T 514',
        keyPoints: '阳极振打杆与顶板不能有触碰',
        normalDesc: '振打杆与顶板之间有足够间隙，无触碰',
        abnormalDesc: '振打杆与顶板发生触碰或间隙不足',
        severity: 'moderate', suggestion: '调整振打杆位置，消除与顶板的干涉',
        visualCues: '检查振打杆顶端与顶板的间距'
      },
      {
        id: 's11', title: '上端板加强角钢', standard: '设计要求',
        keyPoints: '上端板与立柱焊接完成后才能安装加强角钢，不得漏装',
        normalDesc: '加强角钢安装到位，无漏装',
        abnormalDesc: '加强角钢漏装',
        severity: 'moderate', suggestion: '补齐漏装的加强角钢并焊接',
        visualCues: '检查上端板区域加强角钢是否齐全'
      },
      {
        id: 's12', title: '斜拉筋焊接', standard: 'GB 50661',
        keyPoints: '节点板与斜拉筋三面焊接，焊缝符合图纸要求',
        normalDesc: '斜拉筋与节点板三面焊接完整',
        abnormalDesc: '焊接面数不足或焊缝不达标',
        severity: 'moderate', suggestion: '补齐三面焊接，确保焊缝质量',
        visualCues: '检查斜拉筋各节点焊接面数'
      },
      {
        id: 's13', title: '顶梁焊缝', standard: 'GB 50661',
        keyPoints: '顶梁与侧封板须满焊；仰焊缝应在吊装极板前完成',
        normalDesc: '顶梁满焊完成，仰焊缝在吊装前已完成',
        abnormalDesc: '满焊不完整或仰焊缝遗漏',
        severity: 'major', suggestion: '在吊装极板前完成所有顶梁焊缝',
        visualCues: '检查顶梁与侧封板连接处的焊缝完整性'
      },
      {
        id: 's14', title: '下部承压件隐蔽焊缝', standard: 'GB 50661',
        keyPoints: '灰斗提升就位前，下部承压件焊缝应全部焊接验收完成',
        normalDesc: '下部承压件所有焊缝完成并验收合格',
        abnormalDesc: '存在隐蔽焊缝未经验收',
        severity: 'major', suggestion: '在灰斗提升前验收所有下部承压件焊缝',
        visualCues: '检查下部承压件各连接点焊缝'
      },
      {
        id: 's15', title: '抗剪板安装', standard: 'GB 50205',
        keyPoints: '安装抗剪板前，下部承压件隐蔽焊缝应验收合格',
        normalDesc: '隐蔽焊缝验收合格后再安装抗剪板',
        abnormalDesc: '未验收隐蔽焊缝就安装抗剪板',
        severity: 'moderate', suggestion: '先验收隐蔽焊缝，再安装抗剪板',
        visualCues: '确认抗剪板安装前隐蔽焊缝已验收'
      },
      {
        id: 's16', title: '墙板立柱拼装', standard: 'GB 50205',
        keyPoints: '墙板与宽立柱拼焊组合后对角线偏差±5mm',
        normalDesc: '拼装后对角线偏差在±5mm内',
        abnormalDesc: '对角线偏差超出±5mm',
        severity: 'moderate', suggestion: '重新校正墙板立柱位置，控制偏差在±5mm',
        visualCues: '测量拼装后的对角线尺寸'
      },
      {
        id: 's17', title: '地面拼装水平度', standard: 'GB 50205',
        keyPoints: '地面组合时用连通水管测量各点水平高度偏差',
        normalDesc: '各宽立柱安装位置在同一水平面',
        abnormalDesc: '水平度偏差超标',
        severity: 'minor', suggestion: '用垫板调整使各立柱在同一水平面',
        visualCues: '使用连通水管或水平仪测量'
      },
      {
        id: 's18', title: '内部走道安全距离', standard: 'DL/T 514',
        keyPoints: '内部走道边缘与阴极框架下部横管安全距离≥异极距1.2倍',
        normalDesc: '安全距离≥异极距1.2倍',
        abnormalDesc: '安全距离不足',
        severity: 'major', suggestion: '调整走道位置确保安全距离达标',
        visualCues: '测量走道边缘与阴极框架横管的距离'
      },
      // --- 阻流板 (8项) ---
      {
        id: 's19', title: '顶部阻流板', standard: 'DL/T 514',
        keyPoints: '距阳极板排距离符合设计要求，阻流板之间无缺口',
        normalDesc: '顶部阻流板距阳极板排距离达标，板间无缺口',
        abnormalDesc: '距离不符或板间存在缺口',
        severity: 'moderate', suggestion: '调整阻流板位置，消除板间缺口',
        visualCues: '检查阻流板与阳极板排的距离及板间连续性'
      },
      {
        id: 's20', title: '侧部阻流板安装', standard: 'DL/T 514',
        keyPoints: '末电场侧部按图纸安装弯钩阻流板',
        normalDesc: '弯钩阻流板按图纸安装到位',
        abnormalDesc: '未安装或安装位置不符',
        severity: 'moderate', suggestion: '按图纸要求安装侧部弯钩阻流板',
        visualCues: '对照图纸检查侧部阻流板安装情况'
      },
      {
        id: 's21', title: '侧部阻流板与极板密封', standard: 'DL/T 514',
        keyPoints: '侧部阻流板与极板端面应严密，不得有间隙',
        normalDesc: '阻流板与极板端面严密贴合',
        abnormalDesc: '存在间隙，造成烟气旁路',
        severity: 'major', suggestion: '调整阻流板使其与极板端面严密贴合',
        visualCues: '观察阻流板与极板端面之间是否有间隙'
      },
      {
        id: 's22', title: '侧部阻流板完整性', standard: 'DL/T 514',
        keyPoints: '侧部阻流板上部、下部不得漏装',
        normalDesc: '阻流板上下段完整安装',
        abnormalDesc: '上部或下部漏装一段',
        severity: 'major', suggestion: '补齐漏装的阻流板段',
        visualCues: '检查阻流板上下段是否完整'
      },
      {
        id: 's23', title: '侧部阻流板膨胀间隙', standard: 'DL/T 514',
        keyPoints: '垂直向下膨胀间隙预留50mm，不宜过大',
        normalDesc: '膨胀间隙约50mm',
        abnormalDesc: '膨胀间隙过大或未预留',
        severity: 'minor', suggestion: '调整膨胀间隙至50mm左右',
        visualCues: '测量阻流板下方膨胀间隙'
      },
      {
        id: 's24', title: '侧部阻流板与阳极定位', standard: 'DL/T 514',
        keyPoints: '与阳极定位爬侧部不得存在较大间隙',
        normalDesc: '阻流板与阳极定位紧密配合',
        abnormalDesc: '存在较大间隙',
        severity: 'moderate', suggestion: '调整阻流板位置消除间隙',
        visualCues: '检查阻流板与阳极定位之间的间隙'
      },
      {
        id: 's25', title: '顶板焊接面清理', standard: 'GB 50661',
        keyPoints: '壳体顶板焊接前应清理焊接面杂物',
        normalDesc: '焊接面清洁无杂物',
        abnormalDesc: '焊接面存在杂物影响焊接质量',
        severity: 'minor', suggestion: '焊接前清理焊接面杂物',
        visualCues: '观察焊接面清洁度'
      },
      {
        id: 's26', title: '壳体顶板与振打杆干涉', standard: 'DL/T 514',
        keyPoints: '阳极振打杆与顶板不能有触碰',
        normalDesc: '振打杆与顶板无接触',
        abnormalDesc: '振打杆触碰顶板',
        severity: 'moderate', suggestion: '调整振打杆位置消除干涉',
        visualCues: '检查振打杆顶端与顶板间距'
      }
    ]
  },

  // ================================================================
  // 灰斗 (19项)
  // ================================================================
  ashopper: {
    name: '灰斗',
    icon: '\uD83D\uDED0',
    tip: '灰斗安装重点：拼装对角线偏差（上口尺寸-3mm~-6mm）；煤油渗油法检查密封性；加强筋严禁切割后不补回；法兰面偏差±5mm。',
    items: [
      {
        id: 'a1', title: '灰斗拼装尺寸', standard: 'GB 50205',
        keyPoints: '灰斗拼装组合测量大口对角线，上口尺寸偏差-3mm~-6mm',
        normalDesc: '对角线偏差在-3mm~-6mm范围内',
        abnormalDesc: '偏差超出允许范围',
        severity: 'moderate', suggestion: '重新校正拼装尺寸',
        visualCues: '测量灰斗大口对角线和上口尺寸'
      },
      {
        id: 'a2', title: '过渡板位置', standard: '设计要求',
        keyPoints: '上端封口与壁板上端面平齐，下端封口距下端面约600mm',
        normalDesc: '过渡板上下端位置符合要求',
        abnormalDesc: '过渡板位置偏移',
        severity: 'minor', suggestion: '调整过渡板位置',
        visualCues: '测量过渡板上下端封口位置'
      },
      {
        id: 'a3', title: '焊缝密封性', standard: 'GB 50236',
        keyPoints: '灰斗密封焊接，内壁光滑，密封性用煤油渗油法检查',
        normalDesc: '煤油渗油法检查无漏点，内壁光滑',
        abnormalDesc: '煤油试验发现漏点痕迹',
        severity: 'major', suggestion: '对漏点位置进行补焊，重新进行煤油渗油法检验',
        visualCues: '观察焊缝密封性测试结果'
      },
      {
        id: 'a4', title: '挂板安装', standard: '设计要求',
        keyPoints: '数量不少装不漏焊，对应灰斗外部纵向加强筋位置',
        normalDesc: '挂板数量齐全、焊接完整、位置对应外部加强筋',
        abnormalDesc: '挂板数量不足、漏焊或位置不对应外部加强筋',
        severity: 'moderate', suggestion: '补齐挂板并确保位置对应外部加强角钢',
        visualCues: '计数挂板数量，对照外部加强筋位置'
      },
      {
        id: 'a5', title: '外部加强筋', standard: 'GB 50661',
        keyPoints: '纵筋连接板焊接质量不得遗漏；加强筋互相搭接焊牢，严禁切割后不补回',
        normalDesc: '加强筋完整、互相搭接焊牢',
        abnormalDesc: '加强筋被切割后未补回，严重破坏结构强度',
        severity: 'major', suggestion: '立即补回被切割的加强筋段，互相搭接焊接牢固',
        visualCues: '检查加强筋是否完整，有无切割痕迹'
      },
      {
        id: 'a6', title: '气化箱', standard: '设计要求',
        keyPoints: '气化板螺栓及法兰处不能焊接，否则密封硅胶熔化',
        normalDesc: '气化板螺栓和法兰处无焊接痕迹',
        abnormalDesc: '在气化板螺栓或法兰处施焊，导致密封硅胶熔化',
        severity: 'major', suggestion: '严禁在气化板螺栓及法兰处焊接',
        visualCues: '检查气化箱周围是否有违规焊接痕迹'
      },
      {
        id: 'a7', title: '料位计防尘角钢', standard: '设计要求',
        keyPoints: '垂直高出料位计500mm，与水平面夹角约15°，平行于料位计安装',
        normalDesc: '防尘角钢高出料位计500mm，夹角约15°',
        abnormalDesc: '高度或角度不符',
        severity: 'minor', suggestion: '调整防尘角钢位置和角度',
        visualCues: '测量防尘角钢高度和角度'
      },
      {
        id: 'a8', title: '灰斗管撑', standard: 'GB 50661',
        keyPoints: '管撑与主筋在同一水平面，对应壁板外部主筋，缝隙须封堵',
        normalDesc: '管撑对应主筋位置，缝隙已封堵',
        abnormalDesc: '管撑偏位、套入联接板长度不足、缝隙未封堵',
        severity: 'moderate', suggestion: '调整管撑位置使其与主筋对应，封堵缝隙',
        visualCues: '检查管撑与主筋是否在同一水平面'
      },
      {
        id: 'a9', title: '管撑节点板焊缝', standard: 'GB 50661',
        keyPoints: '节点板与管撑、壁板的焊缝质量须保证，不得漏焊',
        normalDesc: '节点板各处焊缝完整无漏焊',
        abnormalDesc: '节点板位置存在漏焊',
        severity: 'major', suggestion: '补齐所有漏焊的节点板焊缝',
        visualCues: '检查节点板与管撑、壁板连接处焊缝'
      },
      {
        id: 'a10', title: '温度计触温接头', standard: 'GB 50661',
        keyPoints: '四周焊缝质量须保证，直接影响温度感应准确度',
        normalDesc: '温度计接头四周焊缝完整',
        abnormalDesc: '焊缝不完整影响温度感应',
        severity: 'minor', suggestion: '补焊温度计接头四周焊缝',
        visualCues: '检查温度计接头四周焊缝'
      },
      {
        id: 'a11', title: '壁板主筋完整性', standard: 'GB 50205',
        keyPoints: '坚决杜绝安装时切开口破坏主筋',
        normalDesc: '主筋完整无损',
        abnormalDesc: '主筋被切开口，强度降低',
        severity: 'major', suggestion: '杜绝破坏主筋行为，已损坏的须修复或更换',
        visualCues: '检查主筋有无切割痕迹'
      },
      {
        id: 'a12', title: '加热器安装', standard: '设计要求',
        keyPoints: '与灰斗壁板接触面积大于90%',
        normalDesc: '加热器与壁板接触面积>90%',
        abnormalDesc: '接触面积不足90%',
        severity: 'moderate', suggestion: '调整加热器安装位置确保接触面积达标',
        visualCues: '观察加热器与壁板的贴合程度'
      },
      {
        id: 'a13', title: '应急卸灰装置', standard: 'GB 50236',
        keyPoints: '与水平面保持向上50°倾斜角，圆周满焊',
        normalDesc: '倾斜角50°，圆周满焊',
        abnormalDesc: '角度不符或焊接不完整',
        severity: 'moderate', suggestion: '调整角度至50°并完成圆周满焊',
        visualCues: '测量倾斜角度，检查焊缝完整性'
      },
      {
        id: 'a14', title: '阻流板装置', standard: 'DL/T 514',
        keyPoints: '第一电场和末电场灰斗各一套，注意方向不能漏装',
        normalDesc: '两套阻流板安装到位，方向正确',
        abnormalDesc: '漏装或方向错误',
        severity: 'major', suggestion: '按图纸要求安装阻流板，注意方向',
        visualCues: '检查第一电场和末电场灰斗内阻流板'
      },
      {
        id: 'a15', title: '灰斗提升定位', standard: 'GB 50205',
        keyPoints: '出灰口法兰中心线偏差±5，法兰面高低偏差±5',
        normalDesc: '法兰中心线和标高偏差在±5mm内',
        abnormalDesc: '偏差超出±5mm',
        severity: 'moderate', suggestion: '重新校正灰斗位置',
        visualCues: '测量法兰中心线和标高'
      },
      {
        id: 'a16', title: '煤油试验漏点补焊', standard: 'GB 50236',
        keyPoints: '煤油试验查出漏点痕迹须及时补焊',
        normalDesc: '所有漏点已补焊完成',
        abnormalDesc: '漏点未补焊',
        severity: 'major', suggestion: '及时补焊所有煤油试验漏点',
        visualCues: '观察煤油试验后的漏点标记'
      },
      {
        id: 'a17', title: '灰斗管撑套入长度', standard: 'GB 50661',
        keyPoints: '管撑不能偏边，套入联接板长度须充足',
        normalDesc: '管撑居中对位，套入长度充足',
        abnormalDesc: '管撑偏边导致套入长度不足，降低强度',
        severity: 'moderate', suggestion: '调整管撑至居中位置确保套入长度',
        visualCues: '观察管撑在联接板中的对位情况'
      },
      {
        id: 'a18', title: '灰斗法兰直线度', standard: 'GB 50205',
        keyPoints: '灰斗出灰口法兰中心在电场长度和宽度方向上在一条直线上',
        normalDesc: '法兰中心在长度和宽度方向成一直线',
        abnormalDesc: '法兰中心偏移不在同一直线上',
        severity: 'moderate', suggestion: '调整灰斗位置使法兰中心对齐',
        visualCues: '检查各灰斗法兰中心是否对齐'
      },
      {
        id: 'a19', title: '灰斗壁板平整度', standard: 'GB 50205',
        keyPoints: '壁板拼装后表面应平整',
        normalDesc: '壁板表面平整无明显凹凸',
        abnormalDesc: '壁板表面存在明显凹凸变形',
        severity: 'minor', suggestion: '校正壁板平整度',
        visualCues: '目测壁板表面平整度'
      }
    ]
  },

  // ================================================================
  // 阳极系统 (16项)
  // ================================================================
  anode: {
    name: '阳极系统',
    icon: '\u26A1',
    tip: '阳极系统重点：极板在自由铅垂状态下调整，禁止下部手推；悬挂销板圆周焊两道；阳极接地线为带伸缩弯圆钢，焊缝≥50mm；异极距≥Bmin。',
    items: [
      {
        id: 'an1', title: '极板铅垂度调整方法', standard: 'DL/T 514',
        keyPoints: '调整前不得安装下部调整杆，须在自由铅垂状态下调整，禁止下部手推',
        normalDesc: '使用手拉葫芦从上部调整极板铅垂度',
        abnormalDesc: '在极板下部用手推方式调整铅垂度',
        severity: 'major', suggestion: '停止下部手推调整，改用手拉葫芦方式从上部调整',
        visualCues: '观察现场是否有人在极板下部推调整'
      },
      {
        id: 'an2', title: '铅垂度基准线设置', standard: 'DL/T 514',
        keyPoints: '第二排和倒数第二排设置铅垂线作为基准',
        normalDesc: '基准铅垂线设置正确',
        abnormalDesc: '未设置基准线或设置位置不正确',
        severity: 'moderate', suggestion: '在第二排和倒数第二排极板处设置铅垂线基准',
        visualCues: '检查是否设置了基准铅垂线'
      },
      {
        id: 'an3', title: '悬挂销板焊接', standard: 'GB 50661',
        keyPoints: '悬挂销与固定板圆周焊，焊接两道，焊缝饱满，去除焊渣',
        normalDesc: '悬挂销板圆周两道焊缝，饱满无焊渣',
        abnormalDesc: '焊缝不足两道或不饱满',
        severity: 'major', suggestion: '按图纸要求焊接两道圆周焊缝并去除焊渣',
        visualCues: '检查悬挂销板焊缝道数和饱满度'
      },
      {
        id: 'an4', title: '悬挂销板安装方法', standard: 'DL/T 514',
        keyPoints: '点焊时须将悬挂销板向上提起使圆钢与套筒充分接触',
        normalDesc: '悬挂销板提起后圆钢与套筒紧密接触',
        abnormalDesc: '未提起导致接触不充分',
        severity: 'moderate', suggestion: '提起悬挂销板确保圆钢与套筒充分接触后再点焊',
        visualCues: '检查悬挂销与极板套筒的接触情况'
      },
      {
        id: 'an5', title: '振打砧梁安装', standard: 'DL/T 514',
        keyPoints: '先两头就位保证铅垂，再拉钢丝基准线安装其余',
        normalDesc: '砧梁在同一分区一条直线上，铅垂度合格',
        abnormalDesc: '砧梁不在同一线上或铅垂度超标',
        severity: 'moderate', suggestion: '先两头就位，拉钢丝基准线安装其余砧梁',
        visualCues: '用水平尺检查振打杆铅垂度'
      },
      {
        id: 'an6', title: '阳极接地线', standard: 'GB 50169',
        keyPoints: '每个振打砧梁对应一个接地线，带伸缩弯圆钢，焊缝≥50mm，严禁直圆钢代替',
        normalDesc: '接地线齐全，带伸缩弯，焊缝≥50mm',
        abnormalDesc: '接地线漏装或用直圆钢代替',
        severity: 'major', suggestion: '补齐接地线，使用带伸缩弯圆钢，焊缝不小于50mm',
        visualCues: '计数接地线数量，检查是否带伸缩弯'
      },
      {
        id: 'an7', title: '传力板安装', standard: 'GB 50661',
        keyPoints: '型号按图纸安装，两边高中间低；仰焊缝立焊缝饱满',
        normalDesc: '传力板型号正确、方向正确、焊缝饱满',
        abnormalDesc: '型号错误或方向装反',
        severity: 'moderate', suggestion: '按图纸核对传力板型号和安装方向',
        visualCues: '检查传力板型号标识和安装方向'
      },
      {
        id: 'an8', title: '定位耙', standard: 'DL/T 514',
        keyPoints: '与阳极板接触处两端及每隔3个焊接',
        normalDesc: '定位耙焊接方式符合要求',
        abnormalDesc: '焊接方式不符',
        severity: 'minor', suggestion: '按图纸要求调整定位耙焊接',
        visualCues: '检查定位耙焊接间距和方式'
      },
      {
        id: 'an9', title: '定位耙与阻流板干涉', standard: 'DL/T 514',
        keyPoints: '定位耙与侧部阻流板干涉处开口预留50mm向下膨胀空间',
        normalDesc: '预留50mm向下膨胀空间',
        abnormalDesc: '未预留膨胀空间',
        severity: 'minor', suggestion: '在干涉处开口预留50mm膨胀空间',
        visualCues: '检查定位耙与阻流板交接处'
      },
      {
        id: 'an10', title: '调整杆与导向槽钢', standard: '设计要求',
        keyPoints: '挡杆两端仅与调整杆焊接，不得与槽钢焊接',
        normalDesc: '挡杆仅焊在调整杆上',
        abnormalDesc: '挡杆与槽钢焊接',
        severity: 'moderate', suggestion: '去除挡杆与槽钢的错误焊缝',
        visualCues: '检查挡杆两端焊接对象'
      },
      {
        id: 'an11', title: '防摆板', standard: 'DL/T 514',
        keyPoints: '防摆杆与防摆板距离>50mm，防摆杆在孔中心且铅锤',
        normalDesc: '距离>50mm，防摆杆居中且铅锤',
        abnormalDesc: '距离不足或防摆杆偏移',
        severity: 'moderate', suggestion: '调整防摆板位置使间距大于50mm',
        visualCues: '测量防摆杆与防摆板的距离'
      },
      {
        id: 'an12', title: '调整杆螺栓止转', standard: '设计要求',
        keyPoints: '调整杆与阳极板连接螺栓、螺母止转焊',
        normalDesc: '螺栓螺母已止转焊',
        abnormalDesc: '未做止转焊',
        severity: 'minor', suggestion: '对螺栓螺母进行止转焊',
        visualCues: '检查调整杆连接处螺栓止转焊'
      },
      {
        id: 'an13', title: '异极距检测', standard: 'DL/T 514',
        keyPoints: '制作通规现场测量，必须满足≥Bmin',
        normalDesc: '异极距≥Bmin',
        abnormalDesc: '异极距<Bmin',
        severity: 'major', suggestion: '调整极板位置使异极距满足要求',
        visualCues: '使用通规测量异极距'
      },
      {
        id: 'an14', title: '极板同步调整', standard: 'DL/T 514',
        keyPoints: '须同时调整同一通道上两排极板铅垂度',
        normalDesc: '同一通道两排极板同步调整',
        abnormalDesc: '单独调整一排极板',
        severity: 'moderate', suggestion: '同时调整同一通道上的两排极板',
        visualCues: '观察是否同时调整两排极板'
      },
      {
        id: 'an15', title: '传力板焊缝', standard: 'GB 50661',
        keyPoints: '仰焊缝、立焊缝按图纸要求焊接，焊缝饱满，不得漏焊',
        normalDesc: '仰焊缝和立焊缝饱满完整',
        abnormalDesc: '存在漏焊或焊缝不饱满',
        severity: 'moderate', suggestion: '补齐漏焊并确保焊缝饱满',
        visualCues: '检查传力板仰焊缝和立焊缝'
      },
      {
        id: 'an16', title: '极板就位配合', standard: 'DL/T 514',
        keyPoints: '须两个操作人员配合，使插销板销与极板套筒紧密接触后方可点焊',
        normalDesc: '两人配合操作，插销与套筒紧密接触',
        abnormalDesc: '单人操作导致接触不良',
        severity: 'minor', suggestion: '安排两人配合完成悬挂销板点焊',
        visualCues: '观察操作人员数量和配合情况'
      }
    ]
  },

  // ================================================================
  // 阴极系统 (26项) = 阴极系统(14) + 阴极框架组合(12)
  // ================================================================
  cathode: {
    name: '阴极系统',
    icon: '\uD83D\uDD0C',
    tip: '阴极系统重点：吊杆圆周焊8mm高；严禁吊杆与振打杆焊接；主桅杆U型焊缝饱满连续且焊后去除插销；防扭挡块只允许螺母与螺栓点焊。',
    items: [
      // --- 阴极系统主体(14项) ---
      {
        id: 'c1', title: '阴极吊杆焊接', standard: 'GB 50661',
        keyPoints: '吊杆与吊梁圆周焊，焊缝高度8mm，焊缝须饱满',
        normalDesc: '圆周焊缝高度8mm，饱满完整',
        abnormalDesc: '焊缝高度不足或不饱满',
        severity: 'major', suggestion: '补焊至8mm高度并确保饱满',
        visualCues: '检查吊杆与吊梁圆周焊缝高度和饱满度'
      },
      {
        id: 'c2', title: '吊杆与振打杆严禁焊接', standard: 'GB 50661',
        keyPoints: '严禁阴极吊杆与振打杆焊接',
        normalDesc: '吊杆与振打杆之间无焊接',
        abnormalDesc: '吊杆与振打杆被焊接在一起',
        severity: 'major', suggestion: '割除错误焊缝，恢复吊杆与振打杆独立',
        visualCues: '检查吊杆和振打杆之间有无违规焊缝'
      },
      {
        id: 'c3', title: '主桅杆插销', standard: '设计要求',
        keyPoints: '插销必须在U型焊缝焊接完成后拔出，不得点焊或满焊或残留',
        normalDesc: '插销已拔出，主桅杆内无残留',
        abnormalDesc: '插销未拔出、被点焊或残留在主桅杆内',
        severity: 'major', suggestion: '拔出插销，严禁点焊或满焊',
        visualCues: '检查主桅杆U型焊缝处插销是否已拔出'
      },
      {
        id: 'c4', title: '阴极下振打杆仰焊缝', standard: 'GB 50661',
        keyPoints: '振打杆与砧梁仰焊缝要求圆周焊、焊缝饱满，此处较隐蔽易漏焊',
        normalDesc: '仰焊缝圆周焊饱满完整',
        abnormalDesc: '仰焊缝漏焊或不饱满',
        severity: 'major', suggestion: '补焊仰焊缝至圆周焊饱满',
        visualCues: '重点检查振打杆与砧梁连接处的隐蔽仰焊缝'
      },
      {
        id: 'c5', title: '吊耳与砧梁不允许焊接', standard: '设计要求',
        keyPoints: '吊耳与砧梁不允许焊接，否则影响振打效果',
        normalDesc: '吊耳与砧梁之间无焊接',
        abnormalDesc: '吊耳与砧梁被焊接在一起',
        severity: 'major', suggestion: '割除错误焊缝，保持吊耳与砧梁独立',
        visualCues: '检查吊耳与砧梁之间有无违规焊接'
      },
      {
        id: 'c6', title: '主桅杆U型焊缝', standard: 'GB 50661',
        keyPoints: 'U型焊缝饱满，切忌中间凹坑；竖缝与弧形过渡处须连续焊',
        normalDesc: 'U型焊缝饱满连续，无凹坑',
        abnormalDesc: '中间出现凹坑或竖缝与弧形过渡处断开',
        severity: 'major', suggestion: '对凹坑处补焊至饱满，竖缝与弧形过渡处须连续焊',
        visualCues: '检查U型焊缝整体饱满度和连续性'
      },
      {
        id: 'c7', title: '防扭挡块', standard: 'DL/T 514',
        keyPoints: '螺栓螺母不应锁紧，只允许螺母与螺栓点焊止转；严禁与横管焊死',
        normalDesc: '螺母与螺栓点焊止转，未锁紧，未与横管焊接',
        abnormalDesc: '与横管焊死或螺母脱落未点焊',
        severity: 'major', suggestion: '割除与横管的错误焊缝，只保留螺母与螺栓点焊',
        visualCues: '检查防扭挡块与横管和螺母的连接方式'
      },
      {
        id: 'c8', title: '阴极接地线', standard: 'GB 50169',
        keyPoints: '接地线与上连接套、底座均要求双面满焊',
        normalDesc: '双面满焊完成',
        abnormalDesc: '焊接不完整，长期振打易掉落造成短路',
        severity: 'major', suggestion: '补焊至双面满焊',
        visualCues: '检查接地线上下两端焊接完整性'
      },
      {
        id: 'c9', title: '下部防摆', standard: 'DL/T 514',
        keyPoints: '第1、4、7、10排及最尾排阴极框架下部螺母与插销和垫片点焊，其余销子拔掉',
        normalDesc: '指定排的螺母与插销垫片点焊，其余已拔除',
        abnormalDesc: '未按要求执行点焊或拔除',
        severity: 'moderate', suggestion: '按要求对指定排进行点焊，其余拔除销子',
        visualCues: '逐排检查阴极框架下部防摆装置'
      },
      {
        id: 'c10', title: '瓷瓶电加热器托架', standard: '设计要求',
        keyPoints: '安装方向不能将有棱角的朝向绝缘子',
        normalDesc: '托架方向正确，棱角未朝向绝缘子',
        abnormalDesc: '棱角朝向绝缘子，可能损伤绝缘子',
        severity: 'moderate', suggestion: '调整托架方向使棱角远离绝缘子',
        visualCues: '观察托架棱角与绝缘子的朝向关系'
      },
      {
        id: 'c11', title: '绝缘子保护', standard: 'DL/T 514',
        keyPoints: '做好防护措施，焊渣飞溅粘附会导致爬电闪络损坏',
        normalDesc: '绝缘子有防护措施，表面清洁',
        abnormalDesc: '焊渣飞溅粘附绝缘子表面',
        severity: 'major', suggestion: '施工中对绝缘件做好防护，已污染的用干布、酒精擦洗',
        visualCues: '检查绝缘子表面是否有焊渣污染'
      },
      {
        id: 'c12', title: '绝缘子清洁', standard: 'DL/T 514',
        keyPoints: '绝缘件内外壁用干布、酒精等擦洗干净',
        normalDesc: '绝缘子内外壁清洁',
        abnormalDesc: '绝缘子表面有污染',
        severity: 'moderate', suggestion: '用干布和酒精擦洗绝缘子',
        visualCues: '观察绝缘子内外壁清洁度'
      },
      {
        id: 'c13', title: 'U型焊缝收弧位置', standard: 'GB 50661',
        keyPoints: '竖缝与弧形过渡处须连续焊，到弧形最上端中间才能收弧',
        normalDesc: '连续焊至弧形最上端中间收弧',
        abnormalDesc: '在过渡处断开收弧',
        severity: 'moderate', suggestion: '确保从竖缝到弧形最上端连续焊接',
        visualCues: '检查U型焊缝收弧位置'
      },
      {
        id: 'c14', title: '阴极吊杆圆周焊一致性', standard: 'GB 50661',
        keyPoints: '吊杆与吊梁圆周焊焊缝高度8mm须均匀一致',
        normalDesc: '圆周焊缝高度均匀8mm',
        abnormalDesc: '焊缝高度不均匀',
        severity: 'moderate', suggestion: '补焊使圆周焊缝高度均匀达标',
        visualCues: '绕吊杆一周检查焊缝高度均匀性'
      },
      // --- 阴极框架组合(12项) ---
      {
        id: 'c15', title: '主桅杆对接同轴度', standard: '设计要求',
        keyPoints: '头尾两销孔定位，确保上下段同轴度',
        normalDesc: '上下段同轴度达标',
        abnormalDesc: '同轴度偏差超标',
        severity: 'moderate', suggestion: '用销孔定位确保同轴度',
        visualCues: '检查主桅杆上下段对接是否对齐'
      },
      {
        id: 'c16', title: '主桅杆直线度', standard: '设计要求',
        keyPoints: '对接整体直线度须达到标准要求5mm内',
        normalDesc: '直线度≤5mm',
        abnormalDesc: '直线度>5mm',
        severity: 'moderate', suggestion: '校正主桅杆直线度至5mm内',
        visualCues: '目测或拉线检查主桅杆直线度'
      },
      {
        id: 'c17', title: '主桅杆对接焊缝', standard: 'GB 50661',
        keyPoints: '对接间隙2±1mm，须确认内衬环，采用CO2气体保护焊',
        normalDesc: 'CO2保护焊完成，间隙2±1mm，有内衬环',
        abnormalDesc: '未使用CO2保护焊或间隙不符',
        severity: 'major', suggestion: '确认内衬环存在，使用CO2保护焊，控制间隙2±1mm',
        visualCues: '检查对接焊缝质量和间隙尺寸'
      },
      {
        id: 'c18', title: '焊缝表面打磨', standard: '设计要求',
        keyPoints: '对接后焊缝表面打磨，去除毛刺凸点',
        normalDesc: '焊缝表面光滑无毛刺',
        abnormalDesc: '焊缝表面有毛刺凸点',
        severity: 'minor', suggestion: '打磨焊缝表面去除毛刺凸点',
        visualCues: '触摸或目测焊缝表面光滑度'
      },
      {
        id: 'c19', title: '阴极线穿线位置', standard: 'DL/T 514',
        keyPoints: '穿线时不能将线穿入外孔（最外端二个孔不穿线）',
        normalDesc: '阴极线穿入正确孔位，未穿入外孔',
        abnormalDesc: '阴极线穿入了外孔',
        severity: 'moderate', suggestion: '重新穿线，避开最外端两个孔',
        visualCues: '检查横管最外端孔位是否有阴极线'
      },
      {
        id: 'c20', title: '阴极线针尖朝向', standard: 'DL/T 514',
        keyPoints: '针尖朝向按图纸要求安装',
        normalDesc: '针尖朝向符合图纸',
        abnormalDesc: '针尖朝向错误',
        severity: 'moderate', suggestion: '按图纸调整针尖朝向',
        visualCues: '对照图纸检查针尖朝向'
      },
      {
        id: 'c21', title: '阴极线搭接长度', standard: 'DL/T 514',
        keyPoints: '两阴极线搭接超出横管长约15mm，焊接长度不小于10mm',
        normalDesc: '搭接超15mm，焊接≥10mm',
        abnormalDesc: '搭接或焊接长度不足',
        severity: 'moderate', suggestion: '确保搭接超出15mm且焊接长度≥10mm',
        visualCues: '测量搭接和焊接长度'
      },
      {
        id: 'c22', title: '阴极线工艺长度割除', standard: '设计要求',
        keyPoints: '超出框架上部横管的工艺长度割除，端部不超过10mm',
        normalDesc: '端部长度不超过10mm',
        abnormalDesc: '工艺长度未割除或端部过长',
        severity: 'minor', suggestion: '割除多余工艺长度至10mm内',
        visualCues: '检查上部横管处阴极线端部长度'
      },
      {
        id: 'c23', title: '阴极线穿线顺序', standard: 'DL/T 514',
        keyPoints: '按正确排列顺序穿线',
        normalDesc: '穿线顺序正确',
        abnormalDesc: '穿线顺序错误',
        severity: 'moderate', suggestion: '按图纸正确顺序重新穿线',
        visualCues: '对照图纸检查穿线排列顺序'
      },
      {
        id: 'c24', title: '阴极框架对角线', standard: 'GB 50205',
        keyPoints: '阴极框架对角差值应≤5mm',
        normalDesc: '对角差值≤5mm',
        abnormalDesc: '对角差值>5mm',
        severity: 'moderate', suggestion: '校正框架尺寸使对角差值≤5mm',
        visualCues: '测量阴极框架对角线尺寸'
      },
      {
        id: 'c25', title: '阴极框架平面度', standard: 'GB 50205',
        keyPoints: '制作完成后应侧挂检验平面度，主桅杆和横管直线度是主要影响因素',
        normalDesc: '平面度合格',
        abnormalDesc: '平面度超标',
        severity: 'moderate', suggestion: '检查主桅杆和横管直线度并校正',
        visualCues: '侧挂检验框架平面度'
      },
      {
        id: 'c26', title: '主桅杆对接确认内衬环', standard: '设计要求',
        keyPoints: '对接前须确认是否有内衬环',
        normalDesc: '内衬环已安装',
        abnormalDesc: '缺少内衬环',
        severity: 'major', suggestion: '对接前确认安装内衬环',
        visualCues: '检查对接处是否有内衬环'
      }
    ]
  },

  // ================================================================
  // 振打系统 (6项)
  // ================================================================
  rapping: {
    name: '振打系统',
    icon: '\uD83D\uDD28',
    tip: '振打系统重点：振打棒有孔端（未渗碳）朝上；露出长度60±2mm；底座填料盖须拧紧；钢带夹组24h后锁紧；同心度5mm。',
    items: [
      {
        id: 'r1', title: '振打棒方向', standard: 'DL/T 514',
        keyPoints: '有孔（未经过渗碳处理）的一端朝上安装',
        normalDesc: '有孔端朝上',
        abnormalDesc: '有孔端朝下，方向装反',
        severity: 'major', suggestion: '拆下振打棒重新安装，确保有孔端朝上',
        visualCues: '检查振打棒有孔端朝向'
      },
      {
        id: 'r2', title: '振打杆露出长度', standard: '设计要求',
        keyPoints: '严格按图纸控制，通常为60±2mm',
        normalDesc: '露出长度60±2mm',
        abnormalDesc: '露出长度偏差超过60±2mm',
        severity: 'moderate', suggestion: '调整振打杆位置至60±2mm',
        visualCues: '测量振打杆露出长度'
      },
      {
        id: 'r3', title: '底座填料密封', standard: 'DL/T 514',
        keyPoints: '填料盖必须拧紧，必要时用渗水方法检查密封性',
        normalDesc: '填料盖拧紧，密封性合格',
        abnormalDesc: '填料盖未拧紧或密封不良',
        severity: 'moderate', suggestion: '拧紧填料盖，必要时用渗水法检查',
        visualCues: '检查填料盖紧固状态'
      },
      {
        id: 'r4', title: '钢带夹组', standard: '设计要求',
        keyPoints: '安装时不要锁紧，等振打器工作24小时后再锁紧',
        normalDesc: '钢带夹组未锁紧（待24h后锁紧）',
        abnormalDesc: '安装时已锁紧',
        severity: 'moderate', suggestion: '松开钢带夹组，待振打器工作24小时后再锁紧',
        visualCues: '检查钢带夹组锁紧状态'
      },
      {
        id: 'r5', title: '振打棒同心度', standard: 'DL/T 514',
        keyPoints: '振打棒与振打杆同心度5mm',
        normalDesc: '同心度≤5mm',
        abnormalDesc: '同心度>5mm',
        severity: 'moderate', suggestion: '调整振打棒位置使同心度≤5mm',
        visualCues: '测量振打棒与振打杆的同心度'
      },
      {
        id: 'r6', title: '振打器底座同心度', standard: 'DL/T 514',
        keyPoints: '底座与振打杆同心度不得超差，否则造成振打力偏心',
        normalDesc: '底座与振打杆同心度合格',
        abnormalDesc: '同心度超差过大，一侧靠在一起',
        severity: 'major', suggestion: '调整底座位置消除偏心',
        visualCues: '观察底座与振打杆的间隙是否均匀'
      }
    ]
  },

  // ================================================================
  // 钢支架与支座 (9项) = 钢支架(6) + 支座(3)
  // ================================================================
  support: {
    name: '钢支架与支座',
    icon: '\uD83E\uDDF1',
    tip: '钢支架重点：立柱垂直度≤H/1000mm；水平标高±3mm；地脚螺栓配双螺母；二次浇灌须在壳体安装前完成。',
    items: [
      {
        id: 'sp1', title: '柱脚辅助加强筋板', standard: 'GB 50205',
        keyPoints: '斜撑焊接完毕后须及时安装，筋板坡口朝外便于施焊',
        normalDesc: '筋板安装到位，坡口朝外',
        abnormalDesc: '筋板漏装或坡口方向错误',
        severity: 'moderate', suggestion: '及时安装筋板，坡口朝外布置',
        visualCues: '检查柱脚处加强筋板安装情况'
      },
      {
        id: 'sp2', title: '接地线与地脚螺栓', standard: 'GB 50169',
        keyPoints: '接地线不遗漏、焊接规范，每个地脚螺栓配二个螺母锁紧后焊接',
        normalDesc: '接地线齐全焊接规范，地脚螺栓双螺母锁紧',
        abnormalDesc: '接地线遗漏或地脚螺栓螺母不足两个',
        severity: 'major', suggestion: '补齐接地线并确保每个地脚螺栓配二个螺母',
        visualCues: '计数接地线和地脚螺栓螺母数量'
      },
      {
        id: 'sp3', title: '焊缝防锈与孔洞封堵', standard: 'GB 50224',
        keyPoints: '焊缝及时涂刷防锈底漆，孔洞及时封堵',
        normalDesc: '焊缝已涂防锈漆，孔洞已封堵',
        abnormalDesc: '焊缝未涂防锈漆或孔洞未封堵',
        severity: 'minor', suggestion: '及时涂刷防锈底漆并封堵孔洞',
        visualCues: '检查焊缝防锈处理和孔洞封堵情况'
      },
      {
        id: 'sp4', title: '柱脚二次浇灌', standard: 'GB 50205',
        keyPoints: '钢支架安装完壳体安装前，柱脚须及时进行二次浇灌',
        normalDesc: '柱脚二次浇灌在壳体安装前完成',
        abnormalDesc: '壳体安装前柱脚未进行二次浇灌',
        severity: 'major', suggestion: '在壳体安装前完成柱脚二次浇灌',
        visualCues: '检查柱脚浇灌状态'
      },
      {
        id: 'sp5', title: '立柱垂直度', standard: 'GB 50205',
        keyPoints: '立柱就位后和安装完毕都要检测，≤H/1000mm',
        normalDesc: '立柱垂直度≤H/1000mm',
        abnormalDesc: '垂直度超标',
        severity: 'major', suggestion: '使用经纬仪复测并调整立柱位置',
        visualCues: '使用经纬仪或铅垂线测量立柱垂直度'
      },
      {
        id: 'sp6', title: '水平标高', standard: 'GB 50205',
        keyPoints: '各柱标高±3mm',
        normalDesc: '各柱标高偏差在±3mm内',
        abnormalDesc: '标高偏差超出±3mm',
        severity: 'moderate', suggestion: '调整各柱标高至±3mm内',
        visualCues: '使用水准仪测量各柱标高'
      },
      // --- 支座(3项) ---
      {
        id: 'sp7', title: '支座类型与安装', standard: 'DL/T 514',
        keyPoints: '固定/单向活动/多向活动支座按图纸布置，安装顺序由下到上',
        normalDesc: '支座类型和位置符合图纸，安装顺序正确',
        abnormalDesc: '支座类型或位置不符',
        severity: 'major', suggestion: '对照图纸核对支座类型和位置',
        visualCues: '对照支座布置图检查各支座类型'
      },
      {
        id: 'sp8', title: '活动支座限位块', standard: 'DL/T 514',
        keyPoints: '支架柱顶板与支座装配后须清除活动支座临时限位块',
        normalDesc: '临时限位块已清除',
        abnormalDesc: '临时限位块未清除',
        severity: 'moderate', suggestion: '清除活动支座的临时限位块',
        visualCues: '检查活动支座处有无临时限位块'
      },
      {
        id: 'sp9', title: '支座安装顺序', standard: 'DL/T 514',
        keyPoints: '除固定支座外，安装顺序由下到上：底座+调整垫片+不锈钢板+滑板',
        normalDesc: '安装顺序正确',
        abnormalDesc: '安装顺序错误或缺少组件',
        severity: 'moderate', suggestion: '按正确顺序重新安装：底座→调整垫片→不锈钢板→滑板',
        visualCues: '检查支座各层组件安装顺序'
      }
    ]
  },

  // ================================================================
  // 进出口喇叭 (10项)
  // ================================================================
  horn: {
    name: '进出口喇叭',
    icon: '\uD83D\uDCE2',
    tip: '进出口喇叭重点：管撑垫板不漏装；管撑三面焊均匀饱满；分布板三层开孔率各不同不可装反；底边距底板150-200mm。',
    items: [
      {
        id: 'h1', title: '管撑垫板', standard: '设计要求',
        keyPoints: '管撑垫板不得漏装',
        normalDesc: '管撑垫板齐全',
        abnormalDesc: '管撑垫板漏装',
        severity: 'moderate', suggestion: '补齐漏装的管撑垫板',
        visualCues: '逐一检查管撑垫板是否齐全'
      },
      {
        id: 'h2', title: '管撑焊接', standard: 'GB 50661',
        keyPoints: '管撑与节点板三面焊要求均匀饱满，不得漏焊。管撑是重要受力件。',
        normalDesc: '三面焊均匀饱满无漏焊',
        abnormalDesc: '焊缝不均匀、不饱满或漏焊',
        severity: 'major', suggestion: '补齐焊缝至三面焊均匀饱满',
        visualCues: '检查管撑与节点板各面焊缝'
      },
      {
        id: 'h3', title: '防冲刷角钢', standard: 'GB 50661',
        keyPoints: '不得漏装不得间断，要焊接好与节点板的焊缝',
        normalDesc: '防冲刷角钢完整安装，无间断',
        abnormalDesc: '漏装或间断安装',
        severity: 'moderate', suggestion: '补齐漏装的防冲刷角钢，不得间断',
        visualCues: '检查防冲刷角钢连续性'
      },
      {
        id: 'h4', title: '管撑受力焊缝', standard: 'GB 50661',
        keyPoints: '管撑是重要受力件，喇叭所受压力通过管撑传递给加强筋',
        normalDesc: '管撑焊缝质量合格能承受受力',
        abnormalDesc: '焊缝质量不足以承受设计载荷',
        severity: 'major', suggestion: '认真焊好管撑与节点板焊缝',
        visualCues: '仔细检查所有管撑焊缝质量'
      },
      {
        id: 'h5', title: '分布板安装位置', standard: 'DL/T 514',
        keyPoints: '三层分布板开孔率不一样，同层不同位置开孔率也不同。平面度≤10mm',
        normalDesc: '每块分布板位置正确，平面度≤10mm',
        abnormalDesc: '分布板安装位置混淆或平面度超标',
        severity: 'major', suggestion: '按图纸核对每块分布板位置和开孔率',
        visualCues: '对照图纸检查分布板位置和标识'
      },
      {
        id: 'h6', title: '分布板底边距离', standard: '设计要求',
        keyPoints: '分布板底边与底板的垂直距离控制为150-200mm，不足的须割除',
        normalDesc: '底边距底板150-200mm',
        abnormalDesc: '距离不足150mm或超过200mm',
        severity: 'moderate', suggestion: '调整分布板高度，不足的割除',
        visualCues: '测量分布板底边与底板的垂直距离'
      },
      {
        id: 'h7', title: '分布板方向与门孔', standard: 'DL/T 514',
        keyPoints: '门孔在人孔门同侧，不得装反（横向叶片纵向叶片方向）',
        normalDesc: '分布板方向正确，门孔在人孔门同侧',
        abnormalDesc: '分布板装反或门孔方向错误',
        severity: 'moderate', suggestion: '调整分布板方向和门孔位置',
        visualCues: '检查分布板叶片方向和人孔门位置'
      },
      {
        id: 'h8', title: '分布板夹板', standard: '设计要求',
        keyPoints: '分布板侧边与侧板联接的夹板不得漏装，图纸要求焊接',
        normalDesc: '夹板齐全并焊接',
        abnormalDesc: '夹板漏装',
        severity: 'minor', suggestion: '补齐漏装的夹板并焊接',
        visualCues: '检查分布板侧边夹板'
      },
      {
        id: 'h9', title: '过渡板', standard: 'GB 50661',
        keyPoints: '四角过渡板应安装到位，焊接牢固，顶部不得漏装',
        normalDesc: '四角过渡板安装到位焊接牢固',
        abnormalDesc: '过渡板漏装或焊接不牢',
        severity: 'moderate', suggestion: '补齐过渡板并焊接牢固',
        visualCues: '检查四角过渡板安装情况'
      },
      {
        id: 'h10', title: '壳体与立柱焊缝', standard: 'GB 50661',
        keyPoints: '连续立焊缝可能因中部承压干涉而漏焊',
        normalDesc: '连续立焊缝完整无漏焊',
        abnormalDesc: '因承压干涉导致漏焊',
        severity: 'moderate', suggestion: '检查并补焊因承压干涉遗漏的焊缝',
        visualCues: '沿壳体与立柱接缝检查焊缝连续性'
      }
    ]
  },

  // ================================================================
  // 顶部起吊 (4项)
  // ================================================================
  hoist: {
    name: '顶部起吊',
    icon: '\uD83C\uDFD7',
    tip: '顶部起吊重点：活动支座螺栓处于孔位中心；斜管撑孔洞须封堵焊；电动葫芦限位器确保吊钩距卷筒≥150mm。',
    items: [
      {
        id: 'ho1', title: '活动支座', standard: 'GB 50205',
        keyPoints: '螺栓中心处于孔位中心，锁紧后将螺母反向松开一圈半再焊接。Z15为固定支座，其余为活动支座。',
        normalDesc: '螺栓居中，螺母已反向松开1.5圈后焊接',
        abnormalDesc: '螺栓偏离孔位中心或螺母未松开',
        severity: 'major', suggestion: '调整支座使螺栓居中，锁紧后反向松开1.5圈再焊接',
        visualCues: '观察螺栓在孔位中的位置和螺母状态'
      },
      {
        id: 'ho2', title: '固定支座位置', standard: 'DL/T 514',
        keyPoints: '现场一般只有一处固定支座，对照布置图不要装错',
        normalDesc: '固定支座位置与布置图一致（通常仅一处）',
        abnormalDesc: '固定支座位置装错',
        severity: 'major', suggestion: '对照支座布置图重新确认并调整',
        visualCues: '对照布置图检查固定支座位置'
      },
      {
        id: 'ho3', title: '斜管撑孔洞封堵', standard: 'GB 50661',
        keyPoints: '管撑与连接板孔洞、螺栓孔必须封堵焊',
        normalDesc: '所有孔洞已封堵焊',
        abnormalDesc: '孔洞未封堵焊',
        severity: 'major', suggestion: '对所有孔洞进行封堵焊',
        visualCues: '检查管撑与连接板的孔洞封堵情况'
      },
      {
        id: 'ho4', title: '电动葫芦限位器', standard: '设计要求',
        keyPoints: '吊钩上升至极限时距卷筒≥150mm；下降至极限时卷筒至少保留3圈钢丝绳',
        normalDesc: '上升极限距卷筒≥150mm，下降极限保留≥3圈',
        abnormalDesc: '上升距离不足150mm或下降圈数不足3圈',
        severity: 'major', suggestion: '按安装调试说明书调整限位器',
        visualCues: '测试电动葫芦上升和下降极限位置'
      }
    ]
  },

  // ================================================================
  // 高压进线 (5项)
  // ================================================================
  hvline: {
    name: '高压进线',
    icon: '\uD83D\uDD0B',
    tip: '高压进线重点：穿墙套管导线装配顺序；绝缘子盖板连接角钢圆周焊5mm高；接地螺栓满焊在保温箱顶板上。',
    items: [
      {
        id: 'hv1', title: '导线装配顺序', standard: '设计要求',
        keyPoints: '穿墙套管处依次：螺母→大平垫圈→导线→大平垫圈→弹簧圈→双螺母',
        normalDesc: '装配顺序正确完整',
        abnormalDesc: '漏装弹簧垫圈或螺母，装配顺序错误',
        severity: 'major', suggestion: '按正确顺序重新装配：螺母→大平垫→导线→大平垫→弹垫→双螺母',
        visualCues: '逐一检查穿墙套管处各组件顺序和完整性'
      },
      {
        id: 'hv2', title: '绝缘子盖板连接角钢', standard: 'GB 50661',
        keyPoints: '圆周焊保证5mm焊高，三级焊缝，去除周边焊渣和毛刺',
        normalDesc: '圆周焊5mm焊高，焊渣毛刺已去除',
        abnormalDesc: '焊缝未达5mm或有焊渣毛刺',
        severity: 'moderate', suggestion: '重新圆周焊至5mm焊高并去除焊渣毛刺',
        visualCues: '检查角钢焊缝高度和表面质量'
      },
      {
        id: 'hv3', title: '连接导线松紧状态', standard: '设计要求',
        keyPoints: '所有连接导线应松紧适宜',
        normalDesc: '导线松紧适宜',
        abnormalDesc: '导线过紧或过松',
        severity: 'minor', suggestion: '调整导线松紧度',
        visualCues: '观察导线张紧状态'
      },
      {
        id: 'hv4', title: '母排螺栓预紧力', standard: 'GB 50205',
        keyPoints: '不同规格的螺栓螺母须用扭力扳手按图纸锁紧',
        normalDesc: '螺栓按图纸扭力要求锁紧',
        abnormalDesc: '螺栓未按图纸要求锁紧',
        severity: 'moderate', suggestion: '使用扭力扳手按图纸要求锁紧',
        visualCues: '检查螺栓锁紧标记'
      },
      {
        id: 'hv5', title: '高频及变压器接地', standard: 'GB 50169',
        keyPoints: '采用镀锌螺栓(M12X50)满焊在保温箱顶板上，不得焊在底座支撑平台上',
        normalDesc: '镀锌螺栓满焊在保温箱顶板上',
        abnormalDesc: '焊在底座支撑平台上而非保温箱顶板',
        severity: 'major', suggestion: '割除错误焊缝，满焊在保温箱顶板上',
        visualCues: '检查接地螺栓焊接位置是顶板还是底座'
      }
    ]
  }
};

module.exports = { standardsDetail };
