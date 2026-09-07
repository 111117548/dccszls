# V4.5 架构基线（无业务代码）

## 1. 架构原则

- 事实与语言生成分离。
- 规则与模型分离。
- 前台体验与离线任务分离。
- 精确位置与长期记忆分离。
- 产品可运行与公开发布门槛分离。
- 所有外部能力通过适配器接入，允许更换供应商。

## 2. 逻辑数据流

```text
微信小程序
  ├─ 授权 / 年龄 / AI 标识 / 安全入口
  ├─ 群列表 / 群聊 / 世界状态
  ├─ 前台位置快照
  └─ 图片选择 / 压缩 / 云存储
          ↓
API Gateway / Session / Rate Limit
          ↓
Image Asset Registry → Image Safety → Vision Adapter → Visual Evidence
          ↓
World Ingestion
  ├─ Geolocation Adapter
  ├─ Reverse Geocode Adapter
  ├─ Weather Adapter
  └─ Evidence Normalizer
          ↓
World Snapshot → World Change Engine → Opportunity Engine
                                             ↓
User Message / Visual Evidence → Intent & Safety → Topic Engine → Director
                                             ↓
Character Contract / Story Ledger → Autonomous Opportunity
                                             ↓
Prompt Builder（仅允许有效 evidence）
                                             ↓
Model Gateway → Structured Character Turns / Bubbles
                                             ↓
Conversation Controller → Cancellable Playback Queue → Message Store
          ↓                    ↓
Memory Extractor         Cost / Audit / Safety Logs
```

## 3. 客户端职责

- UI、交互、前台定位、授权与权限状态。
- 图片选择、压缩、上传进度、图片气泡与预览；客户端不直接调用视觉模型。
- 展示真实/模拟、来源、更新时间和精度。
- 展示 AI 身份、使用时长、安全与投诉入口。
- 在 AI 输入和队列播放期间继续接受用户消息，并取消尚未显示的低优先级可选气泡。
- 不保存服务端密钥，不决定事实可信度，不在本地独立生成 AI 消息。

## 4. 服务端职责

- 微信登录态交换、用户隔离、限流。
- 地图/天气/本地资讯/视觉模型密钥和请求代理。
- 图片资产所有权验证、内容安全、视觉证据净化和失败清理。
- 世界快照、变化、机会、持续议题、Director、Conversation Controller 和异常消息预算。
- 角色合同、当前状态、持续事项、关系、知识边界、故事账本、冲突检查和角色自主交流机会。
- 每个角色回合交付后更新事实、观点、分歧、开放分支和承诺，再决定继续、等待用户、暂停或结束。
- 模型调用、结构化校验、重试、内容安全和成本熔断。
- 数据加密、删除、导出、审计和应急开关。
- 离线事件与重开重建；不假设客户端常驻。

## 5. 核心领域对象补充

```ts
interface EvidenceEnvelope<T> {
  provider: string;
  sourceId: string | null;
  observedAt: number;
  fetchedAt: number;
  expiresAt: number;
  confidence: number;
  isSimulated: boolean;
  rawHash: string;
  data: T;
}

interface WorldSnapshot {
  id: string;
  userId: string;
  capturedAt: number;
  location: EvidenceEnvelope<LocationState> | null;
  weather: EvidenceEnvelope<WeatherState> | null;
  localNews?: EvidenceEnvelope<LocalNewsItem[]>;
  timeContext: TimeContext;
}

interface ConversationState {
  id: string;
  groupId: string;
  mode: string;
  subject: string;
  trigger: 'user' | 'character' | 'world' | 'image' | 'memory';
  userNeed: string | null;
  desiredOutcome: string;
  stage: 'ORIENT' | 'EXPLORE' | 'FRICTION' | 'INTEGRATE' | 'ACT' | 'PAUSED' | 'CLOSED';
  sharedFacts: EvidenceRef[];
  claims: ConversationClaim[];
  disagreements: Disagreement[];
  openLoops: OpenLoop[];
  commitments: Commitment[];
  lastMeaningfulDelta: string;
  lastActiveAt: number;
  pauseReason: string | null;
}

interface NextContributionDecision {
  action:
    | 'CHARACTER_SPEAKS'
    | 'CHARACTERS_CONTINUE'
    | 'WAIT_FOR_USER'
    | 'PAUSE_TOPIC'
    | 'CLOSE_TOPIC'
    | 'ESCALATE_SAFETY';
  speakerId: string | null;
  replyTargetId: string | null;
  motive: string | null;
  expectedDelta: string | null;
  evidenceIds: string[];
  reason: string;
}

interface GenerationTrace {
  model: string;
  modelVersion: string | null;
  promptTemplateVersion: string;
  characterCardVersions: string[];
  evidenceIds: string[];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  safetyResult: string;
}

interface VisualEvidence {
  id: string;
  provider: string;
  model: string;
  analyzedAt: number;
  category: string;
  summary: string;
  objects: string[];
  visibleText: string[];
  notableDetails: string[];
  uncertainties: string[];
  confidence: number;
  safety: 'passed';
}
```

以上只是基线接口，正式编码前需在数据模型阶段补齐字段和隐私分级。

## 6. 位置变化原则

- 首先判断坐标精度是否可用。
- 使用距离、行政区变化、连续快照和滞回共同判断。
- 单次跳点不能直接认定跨城或到达。
- 没有可靠围栏/POI 证据时只描述“定位显示在附近”，不得说“已经进入”。
- 精确坐标不进入角色长期记忆，也不进入普通应用日志。

具体距离阈值做成配置，通过真机数据校准，不在需求阶段伪精确。

## 7. 模型调用边界

模型输入只包含：当前用户消息、必要 L1、当前 Topic、Director 的 Beat 计划、角色卡版本、获准使用的故事片段、允许使用的证据片段和安全指令。

模型输出一次生成完整轮次：

```ts
interface GeneratedRound {
  topicId: string;
  turns: Array<{
    speakerId: string;
    motive: string;
    replyTo: 'user' | string;
    bubbles: string[];
    usedEvidenceIds: string[];
    usedStoryIds: string[];
    required: boolean;
    delayProfile: 'quick' | 'normal' | 'thoughtful' | 'afterthought';
  }>;
  topicDelta: unknown;
  memoryCandidates: unknown[];
  storyCandidates: unknown[];
}
```

服务端必须验证 speaker 顺序、角色回合和气泡数量、reply target、故事与证据引用、长度和安全结果；失败最多重试一次，仍失败则降级或沉默。详细节奏遵守 `CONVERSATION_RHYTHM_AND_AUTONOMY_SPEC.md`。

## 8. 数据分级与保留默认

| 数据 | 级别 | 默认策略 |
|---|---|---|
| 精确坐标、连续位置变化 | 敏感 | 加密、最少访问、≤24h 后删除/粗化 |
| 详细地址 | 高 | 仅即时使用，避免长期保存 |
| 城市/区县事件摘要 | 中 | 可进入短期记忆，有到期时间 |
| 新闻标题、摘要、来源、URL、发布时间 | 中 | 最多 5 条、30 分钟证据缓存；不写入长期记忆 |
| 用户图片 | 高 | 私有云存储、按用户和群隔离；保存期限和批量删除在公开版前冻结 |
| 视觉证据摘要 | 高 | 只保留受控字段、模型与不确定项；不得推断身份或敏感属性 |
| 聊天原文 | 高 | 加密、用户可复制/删除，保留期待合规确认 |
| 记忆摘要 | 高 | 可解释、可删除、带来源和到期时间 |
| 模型调用日志 | 中/高 | 默认不含原始精确坐标；脱敏后审计 |
| 成本指标 | 低 | 聚合保存 |

## 9. 降级顺序

1. 世界数据失败：继续普通聊天，不谈未知现实事实。
2. 模型超时：一次短重试；再失败显示可恢复状态，不伪造回复。
3. 预算逼近：缩短上下文、单角色、关闭主动生成。
4. 内容安全不通过：进入安全回复或拒绝，不让其他角色起哄。
5. 重大安全风险：通过服务端开关暂停主动消息、角色或全部生成服务。

## 10. 不可提前锁死的实现细节

- 数据库品牌、队列品牌和具体云函数平台。
- 地图和天气最终套餐。
- 模型供应商与具体模型。
- GPS 距离/时间阈值。
- 主动消息窗口数值。

这些需要在高风险决策确认、供应商实测和真机样本后冻结。
