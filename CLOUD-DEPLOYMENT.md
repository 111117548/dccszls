# 云开发部署清单

本项目源码已经完成本地业务开发。真实 AI、跨微信设备整改、Excel 下载和订阅提醒依赖微信云开发，首次导入后须按本清单部署。

## 1. 云函数

在微信开发者工具中依次右键以下目录，选择“上传并部署：云端安装依赖”：

- `cloudfunctions/ai-analyze`
- `cloudfunctions/callLLM`
- `cloudfunctions/generate-report`
- `cloudfunctions/generate-inspection-workbook`
- `cloudfunctions/feishu-auth`
- `cloudfunctions/quality-ledger`
- `cloudfunctions/notification-center`
- `cloudfunctions/rectification-reminder`
- `cloudfunctions/feishu-rectification`
- `cloudfunctions/arrival-manifest`

`generate-inspection-workbook` 已内置用户提供的原始工作簿高保真转换模板，共 9 个工作表：封面、检查内容、附表1—附表7。不要删除其 `templates/电除尘器本体安装检查记录-原表.xlsx`，也不要改回旧的重建版模板。

该云函数依赖 `jszip` 进行原位单元格回填。部署时必须选择“上传并部署：云端安装依赖”，不能只上传代码文件。

## 2. 数据库集合

建立下列集合，客户端不能直接写入敏感台账，正式写入统一经过 `quality-ledger`：

- `quality-projects`
- `project-members`
- `quality-inspections`
- `quality-defects`
- `quality-reports`
- `quality-audit-logs`
- `quality-rectification-orders`
- `quality-rectification-reminders`
- `quality-project-foundations`
- `quality-process-records`
- `quality-notification-subscriptions`
- `quality-notification-logs`
- `feishu-user-bindings`
- `feishu-oauth-states`（仅备用 OAuth 使用）

建议索引：

- `quality-inspections`: `projectId + updatedAt`（降序）
- `quality-defects`: `projectId + updatedAtCloud`（降序）
- `quality-reports`: `projectId + updatedAt`（降序）
- `quality-process-records`: `projectId + deviceId + updatedAt`（降序）
- `quality-rectification-reminders`: `enabled + nextSendAt`
- `quality-notification-subscriptions`: `enabled + type + projectId`
- `quality-notification-logs`: `projectId + type + createdAt`（降序）

## 3. AI 环境变量

只在 `ai-analyze` 云函数中配置，不要把密钥填写在小程序客户端：

- `ESP_AI_ENDPOINT`
- `ESP_AI_API_KEY`
- `ESP_AI_MODEL`

未配置时，小程序仍可用演示模式验证页面与流程，但不会形成正式 AI 台账。

## 4. 微信提醒中心

提醒中心包含三类消息：项目负责人接收发货节点预警、项目负责人接收飞书未闭环周报、施工队接收整改催办。微信订阅授权必须由接收人点击按钮发起，客户端不会静默申请权限。

### 4.1 微信公众平台模板

在微信公众平台「功能 → 订阅消息」中选用一个“一次性订阅”模板，三类提醒共用同一个模板 ID：

- 标题：`责任人委派通知`
- 模板编号：`436`
- 项目名称：`thing24`
- 任务名称：`thing12`
- 责任人：`name3`
- 跟进内容：`thing36`
- 提醒日期：`time33`

当前代码已经严格按照上述真实字段发送。发货提醒的任务名称显示发货节点，周报的跟进内容显示待整改/待复验/逾期数量，施工队催办显示整改位置和处理要求。不要再创建旧版 `thing1/number2/time3` 字段结构的模板。

### 4.2 云函数环境变量

在 `notification-center` 中配置：

- `DISPATCH_REMINDER_TEMPLATE_ID`：填写“责任人委派通知”的模板 ID
- `DISPATCH_REMINDER_MODE`：`one_time` 或 `long_term`
- `WEEKLY_RECTIFICATION_TEMPLATE_ID`：填写同一个模板 ID
- `WEEKLY_RECTIFICATION_REMINDER_MODE`：`one_time` 或 `long_term`
- `RECTIFICATION_REMINDER_TEMPLATE_ID`：填写同一个模板 ID（仅用于提醒中心显示施工队模板状态）
- `RECTIFICATION_REMINDER_MODE`
- `RECTIFICATION_REMINDER_SEND_TIME`，例如 `09:00`

在 `quality-ledger` 和 `rectification-reminder` 中配置：

- `RECTIFICATION_REMINDER_TEMPLATE_ID`
- `RECTIFICATION_REMINDER_MODE`
- `RECTIFICATION_REMINDER_SEND_TIME`，例如 `09:00`

普通订阅消息使用 `one_time`；只有账号具备长期订阅模板资格时才使用 `long_term`。微信的一次性订阅授权不能被程序绕过，因此每次授权消费后，接收人需要再次主动订阅。

`notification-center` 每 5 分钟检查一次新发货预警及到期周报；同一发货条件和同一项目周报均带去重标识。`rectification-reminder` 每 15 分钟检查一次各施工队订阅人的设置时间，每人每天最多发送一次。工单进入“待复验”或“已闭环”后会停止催办；复验驳回后恢复整改状态。

施工进度使用“速度推演”时，`notification-center` 会按照基准日期和每日预计百分比重新计算当天预测进度：达到 75% 发送提前准备提醒，达到 80% 发送正式发货预警。预测值不写入实际完成量，项目经理提交实际进度后会自动重新校准推演基准。

本地 `config.json` 已包含定时触发器。上传部署后仍需进入云开发控制台确认两个触发器均处于启用状态，并核对实际运行时区。首次建议把时间设置为当前时间后 5—10 分钟进行真机验收。

## 5. 到货清单自动台账

`arrival-manifest` 用于解析需求总清单及实际到货清单，支持 `.xls`、`.xlsx`。部署时必须选择“上传并部署：云端安装依赖”，以安装 `xlsx`，并在云端把函数执行超时设置为 30 秒。首次导入需求总清单后，系统按唯一箱号建立台账；以后导入到货清单会按箱号匹配、去重并自动更新各施工阶段的到货率与发货预警。

## 6. 飞书整改闭环同步

飞书对接使用独立的 `feishu-rectification` 云函数：飞书下发整改项后，小程序在“整改闭环”页点击“同步飞书”导入；小程序复验通过后，整改照片会回传到飞书原记录的 `闭环` 附件列。最终 `整改状态` 仍由飞书相关部门维护。

部署该函数后，配置环境变量 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BITABLE_APP_TOKEN`、`FEISHU_TABLE_ID`。同时进入云开发控制台的函数详情/高级配置，将 `feishu-rectification` 的“执行超时”设置为 30 秒或 60 秒并保存。若报错中仍出现 `timed out after 3 seconds`，说明云端仍在使用默认 3 秒配置，不能只依赖本地 `config.json` 的显示。

完整字段映射、授权要求和验收步骤见 [FEISHU-INTEGRATION.md](./FEISHU-INTEGRATION.md)。

## 7. 验收顺序

1. 新建项目和设备，切换到第 6 个施工阶段。
2. 填写任一安装检验附表并导出 Excel，确认导出文件仍包含原表的 9 个工作表、图式表和签字区。
3. 正式提交一条 AI 缺陷，生成整改单并转发。
4. 用另一微信进入分享卡片，上传整改照片和说明，提交复验。
5. 创建人在质量台账中通过或驳回复验。
6. 检查云数据库、审计记录和提醒停止状态。
7. 在飞书新建测试整改项，在小程序同步、分享、提交、复验后，确认整改照片已写入飞书原记录的“闭环”列。
