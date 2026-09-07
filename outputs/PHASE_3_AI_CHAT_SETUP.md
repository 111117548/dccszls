# Wchat V4.5 阶段 3：AI 群聊部署

更新日期：2026-07-14  
状态：代码和自动化测试完成，等待模型凭据、云函数部署和真机评测

## 已实现

- 新增 `groupChat` 云函数，模型凭据仅从云端环境变量读取。
- 默认模型为 `deepseek-v4-pro`，可通过环境变量切换。
- 用户每次发言只调用一次模型，一轮生成结构化角色回合和 1—3 个短气泡。
- 第一位角色必须直接回应用户；同一角色可自然补充第二个短气泡，后续角色形成接话链。
- 服务端接收角色核心动机、关系、发言动机、沉默规则和获准故事，不允许模型临时编造新的过去。
- 使用 JSON Output，并再次执行服务端角色顺序、故事 ID、气泡数量、文本和事实边界校验。
- 模型只接收最近 20 条非系统消息。
- 模拟世界状态不会作为事实发送；真实状态也会移除精确经纬度。
- 模型失败、超时、余额不足或输出无效时，聊天页自动使用本地原型回复并明确标记。
- 返回模型名称和 token usage，为后续成本统计保留接口。

## 云函数配置

在微信开发者工具中右键 `cloudfunctions/groupChat`，选择“配置云函数”：

- 运行环境：Node.js 16.13 或更高。
- 执行方法：`index.main`。
- 内存：256 MB。
- 执行超时：30 秒。

添加环境变量：

```text
DEEPSEEK_API_KEY=<新生成的服务端 API Key>
DEEPSEEK_API_HOST=api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

不要使用旧源码中已经暴露的 Key。不要把 Key 写入小程序、云函数源码、截图、日志或 `.env.example`。

保存后右键 `groupChat`，选择“上传并部署：云端安装依赖”。图片理解扩展加入后，该函数使用 `wx-server-sdk` 按当前用户和群读取可信视觉证据。

## 云端测试

测试事件：

```json
{
  "mode": "user",
  "text": "今天有点累，你们陪我聊一会儿吧",
  "history": [],
  "intent": "EMOTION",
  "roundPlan": {
    "maxAiBubbles": 2,
    "cancellable": true,
    "beats": [
      {
        "speakerId": "ning",
        "motive": "support",
        "replyTarget": "user",
        "required": true,
        "maxBubbles": 1,
        "storyId": null,
        "delayProfile": "thoughtful"
      },
      {
        "speakerId": "qiao",
        "motive": "support",
        "replyTarget": "ning",
        "required": false,
        "maxBubbles": 1,
        "storyId": null,
        "delayProfile": "normal"
      }
    ]
  },
  "characters": [
    { "id": "ning", "name": "宁宁", "coreMotive": "让被忽略的感受获得位置" },
    { "id": "qiao", "name": "乔一", "coreMotive": "把被惯性遮住的问题说清楚" }
  ],
  "stories": [],
  "world": { "live": false }
}
```

成功结果应包含：

```json
{
  "success": true,
  "messages": [
    {
      "speakerId": "ning",
      "text": "...",
      "replyTo": "user",
      "motive": "support",
      "delayProfile": "thoughtful",
      "required": true,
      "storyId": null,
      "turnId": "turn-0",
      "bubbleIndex": 0
    }
  ],
  "meta": {
    "provider": "DeepSeek",
    "model": "deepseek-v4-pro"
  }
}
```

## 小程序验证

1. 重新编译并进入群聊。
2. 输入一个明确问题，确认用户消息立即出现。
3. 顶部状态先显示“角色正在想”，成功后显示“DeepSeek 实时生成”。
4. 确认第一条回答直接回应用户，后一位角色能接住上一位。
5. 连续测试问题、情绪、行动计划、天气询问和无意义输入。
6. 未部署或未配置时，顶部会显示具体失败原因，并继续提供本地原型回复。
7. AI 正在输入时继续发送一条用户消息，确认旧轮次未显示内容被取消，新消息优先。
8. 输入“我第一次一个人坐高铁，有点紧张”，确认相关角色可以在直接回应后自然分享固定故事，而不是编造新经历。

## 常见错误

- `model_service_not_configured`：云端缺少模型环境变量。
- `model_http_401` / `model_http_403`：模型 Key 无效或无权限。
- `model_http_402`：模型账户余额不足。
- `model_timeout`：请求超过 25 秒；检查网络和供应商状态。
- `model_output_invalid`：模型输出未通过角色或消息结构校验，客户端会回退。
- 找不到 `groupChat`：云函数未上传到小程序当前绑定的云环境。

## 隐私与发布前要求

调用模型时会向模型供应商发送用户当前消息、最近对话以及经过筛选的城市/区县和天气事实。不会发送精确经纬度。公开测试前必须在隐私政策和用户告知中说明第三方模型处理，并完成内容安全、投诉举报、数据删除和相关备案评估。
