# 电除尘器智能施工质量与数字孪生管理平台

> 面向火电厂电除尘器建设期的微信小程序，将施工进度可视化、AI质量检查、整改复验、工程台账与协作通知连接成一条现场闭环。

[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-07C160)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Native WebGL](https://img.shields.io/badge/Rendering-Native%20WebGL-1677FF)](./components/construction-twin-3d/)
[![Tests](https://img.shields.io/badge/tests-automated-52C41A)](./tests/)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-lightgrey)](./LICENSE)

![电除尘器施工数字孪生视觉封面](./docs/images/esp-digital-twin-hero.png)

<p align="center"><sub>项目视觉封面；实际业务数据以小程序运行环境为准。</sub></p>

## 项目价值

传统电除尘安装管理中的进度、检查照片、缺陷整改和报表往往分散在不同人员与文件中。本项目围绕现场施工人员的手机操作，将这些信息按项目、设备和安装部件统一组织：

- 首页通过原生Canvas/WebGL沙盘展示当前施工范围，并按部件顺序回放建造过程。
- 13类安装部件与到货、安装进度、质量记录和缺陷状态关联。
- AI先检查照片质量与可见问题，人工确认后才形成正式记录。
- 整改单可通过微信开放协作，保留整改证据、复测结果和闭环时间线。
- 七类安装检验记录可回填到既有九工作表Excel模板，便于归档与打印。
- 云函数可衔接飞书协作、订阅提醒、质量台账和报告生成。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 施工数字孪生 | 原生WebGL程序化场景、360°环绕、双指缩放、部件点击、自动施工回放 |
| 13类部件进度 | 当前部件只展示自身及此前部件，避免后续构件提前出现 |
| AI安装质检 | 照片质量预检、检查条目分析、人工确认与结果留痕 |
| 整改复验闭环 | 待整改、整改中、已闭环、重新打开及跨微信协作 |
| 工程质量台账 | 记录、缺陷、照片、空间位置、部件节点和项目设备关联 |
| 原表Excel导出 | 在既有模板中回填封面、检查内容和附表1—7 |
| 飞书与消息协作 | 身份绑定、整改回传、通知中心和订阅提醒部署能力 |
| 多项目/多设备 | 项目、机组、设备上下文切换及权限状态展示 |

## 当前数据规模

- 13类安装部件与88个设备/质量节点。
- 121条结构化安装质量检查标准。
- 7类安装检验记录，覆盖1,440个表单检查项。
- 9个工作表的原始Excel模板回填流程。
- 9个云端业务函数，覆盖AI、台账、报告、通知与飞书协作。

## 业务闭环

```mermaid
flowchart LR
    A[项目与设备] --> B[13类部件进度]
    B --> C[现场拍照与检查条目]
    C --> D[AI辅助分析]
    D --> E[人工确认]
    E --> F{是否存在问题}
    F -- 否 --> G[合格记录与报表]
    F -- 是 --> H[生成整改协作单]
    H --> I[上传整改证据]
    I --> J[复验与闭环]
    J --> G
```

## 技术架构

```mermaid
flowchart TB
    subgraph Client[微信小程序]
      UI[移动端工程工作台]
      Twin[Canvas / Native WebGL数字孪生]
      Forms[检查、整改与检验记录]
    end
    subgraph Cloud[微信云开发]
      Functions[云函数]
      Database[质量台账与协作数据]
      Storage[照片与报表文件]
    end
    AI[可配置AI服务]
    Feishu[飞书身份与整改协作]
    Excel[原始Excel模板]
    UI --> Twin
    UI --> Forms
    Forms --> Functions
    Functions --> Database
    Functions --> Storage
    Functions --> AI
    Functions --> Feishu
    Functions --> Excel
```

更完整的模块说明见[系统架构](./docs/ARCHITECTURE.md)。

## 13类安装部件

1. 钢支架
2. 支座
3. 灰斗
4. 壳体
5. 楼梯平台
6. 阴阳极系统
7. 进出口喇叭
8. 保温箱
9. 灰斗纳米涂层
10. 振打系统
11. 电气安装
12. 顶部起吊系统
13. 调试

首页打开后会从首个在序部件回放到当前部件。例如当前为“壳体”，场景依次呈现支座、钢支架、灰斗和壳体；回放完成后恢复真实进度，后续部件继续隐藏。

## 快速体验

### 运行要求

- 微信开发者工具稳定版。
- 支持`type="webgl"` Canvas的小程序基础库。
- Node.js 20+，仅用于运行仓库测试。

### 本地导入

```bash
git clone https://github.com/111117548/dccszls.git
cd dccszls
```

1. 在微信开发者工具中选择“导入项目”。
2. 选择仓库根目录，项目类型选择“小程序”。
3. 使用自己的测试AppID，或按团队要求配置项目AppID。
4. 编译后可直接体验本地演示数据和数字孪生首页。

真实AI、跨设备协作、Excel下载、订阅提醒与飞书回传需要部署云函数。参见：

- [云开发部署说明](./CLOUD-DEPLOYMENT.md)
- [飞书集成说明](./FEISHU-INTEGRATION.md)

## 测试

无需安装第三方根依赖：

```bash
node --test tests/*.test.js
node tests/static-check.js
node tests/runtime-smoke.js
```

GitHub Actions会在推送和Pull Request时运行同一组核心检查。

## 仓库结构

```text
├─ components/                 小程序公共组件与原生WebGL孪生
├─ pages/                      首页、工作台、检查、整改、报告等页面
├─ cloudfunctions/             AI、质量台账、通知、飞书与报表云函数
├─ utils/                      领域模型、进度、质量与协作工具
├─ tests/                      业务回归、迁移和静态检查
├─ docs/                       架构、演示与宣传素材
├─ CLOUD-DEPLOYMENT.md         微信云开发部署
└─ FEISHU-INTEGRATION.md       飞书集成与权限配置
```

## 演示数据与安全边界

- 仓库默认用于产品演示与开发验证，不包含生产密钥。
- AI返回内容必须经人工确认，不能直接替代工程质量验收结论。
- 数字孪生用于施工可视化和质量信息关联，不用于结构安全计算或运行诊断。
- 公开截图和演示数据不得包含真实人员、OpenID、整改证据或未授权项目资料。
- 上线前请按[安全说明](./SECURITY.md)检查AppID、云环境、密钥和数据库权限。

## Roadmap

- [x] 13类部件施工进度与原生WebGL沙盘
- [x] 首页施工回放、部件筛选、360°查看与真机渲染优化
- [x] AI辅助检查、质量台账和整改复验
- [x] 飞书协作、通知中心与Excel原表导出
- [ ] 经过授权的真实项目演示视频与小程序体验码
- [ ] 模型LOD、性能监控和更多机型真机基准
- [ ] 可配置的行业检查标准包

## 版本记录

当前仓库由早期检查工具逐步演进为施工质量与数字孪生平台。详细历史保留在各版本`CHANGELOG-*.md`中；公开发布以GitHub Releases为准。

## 许可与品牌

本仓库当前用于展示与评估，未授予开源使用许可，详见[LICENSE](./LICENSE)。项目中出现的企业名称、标识和第三方服务商标归各自权利人所有；公开部署前请确认已获得相应授权。

---

**English summary:** A WeChat Mini Program for construction-phase electrostatic precipitator quality inspection, 13-component progress visualization, native WebGL digital-twin interaction, rectification workflow, Feishu collaboration and Excel report export.
