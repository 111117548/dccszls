# 阶段 6：共同群框架第一阶段交付

## 本阶段目标

在不改变现有陪伴群回答规则的前提下，将单群原型改造成可以继续接入讨论群、跨 IP 沙龙群和故事群的共同运行底座。

## 已完成

- 建立 `GroupDefinition`、`GroupMode`、`GroupCapabilities` 和 `GroupModeAdapter`。
- 建立 `GroupRuntime`，统一持有群定义、群状态、世界状态并把消息交给模式适配器。
- 将原有单群逻辑迁移为 `companionModeAdapter`。
- 保留 `PrototypeConversationEngine` 兼容入口，避免现有功能和测试失效。
- 建立群注册表，当前“晚风生活群”拥有稳定的 `groupId`。
- 群列表由注册表生成，不再写死群名称、角色头像和虚假未读数。
- 聊天页通过 `groupId` 选择运行时、成员和欢迎语。
- `CharacterId` 放宽为注册表型字符串，为新增角色解除核心联合类型限制。
- 项目 AppID 统一为已确认的 `wx324d0a9f68df6e21`。

## 当前边界

- 目前只注册了 `companion` 模式。
- `discussion`、`crossover_salon`、`story` 已进入模式枚举，但没有适配器；误用会显式报错，不会偷偷套用陪伴群规则。
- 消息、群状态和已读记录已在阶段 7 接入云数据库；世界变化和事件账本仍未接入。
- 页面退出后不会由云端继续推进群事件。
- 群列表的真实最新消息、未读数和更新时间要等消息仓库完成后接入。

## 下一阶段固定顺序

1. 建立 EventLedger、未读计算和回群摘要。
2. 将消息预算和世界变化检测接入实际运行链路。
3. 开发 `discussion` 适配器，用第二种明显不同的群验证共同框架。

## 验证

运行：

```powershell
node --import ./tests/register-ts.mjs --test tests/*.test.ts
```

本阶段新增群注册表、运行时委派、未实现模式保护和 `groupId` 路由测试。
