# Agent Note: 0.1.3 BEM 壳上的侧栏入口注入

Status: implemented

## Problem

harness 0.1.3-alpha.1 tauri 壳改写了 GUI 侧栏 DOM。侧栏列仍保留哈希 css-module
类名（`[class*="sidebarCol"]` 依旧能命中），但内部区块从 camelCase css-module
类名改成了 BEM 类名：新会话按钮现在是嵌套在 `dshp-panel__panel-area` 区块内的
`button.dshp-panel__new-session`，logo 行变成 `dshp-panel__logo-row` 兄弟区块。
共享核心 `sidebar-entry-core.ts`（消费包 dsh-task-board、dsh-skill-explorer、
dsh-ssh）用 `button[class*="newSession"]` 定位锚点，并假设侧栏 root 就是插入
容器。0.1.3 壳上这两个假设同时失效：锚点查询无命中，`placeEntry` 静默跳过，
插件侧栏入口直接消失；即便找到了锚点，`root.insertBefore(entry, anchor)` 也会
因锚点的父节点（panel-area 区块）不是侧栏 root 而抛 NotFoundError。skin-center
语义适配器的 new-session 规则（`SEMANTIC_RULES_V1`）带着同款单代际选择器，
因此在 0.1.3 壳上不再给按钮盖 `data-dsh-part="new-session"`——而皮肤正是靠
这个属性做稳定锚点。

## Decision

让两代壳类名都能被寻址。在 `shared/client/sidebar-entry-core.ts` 中：

1. `newSessionButton` 的锚点查询改为
   `button[class*="newSession"], button[class*="new-session"]`，同时匹配 0.1.2
   camelCase css-module 类名与 0.1.3 BEM 类名。
2. `placeEntry` 不再假设侧栏 root 是插入容器，而是从锚点的真实 DOM 位置推导
   宿主：先用 `button.closest('[class*="logoRow"], [class*="logo-row"]')` 找
   logo 行，若 logo 行是 root 直接子节点（旧几何）则取行，否则取按钮本身，
   最终插入到该 base 的 `parentElement`。旧壳上宿主解析回侧栏 root，行为不变；
   0.1.3 壳上宿主是 panel-area 区块，入口落在新会话行正后方。family 锚点扫描
   与"禁止 append 到末尾"规则随之改为在宿主的子节点上进行。
3. `packages/skins/skin-center/src/client/runtime/semantic-adapter.ts` 的
   new-session 规则扩展为
   `button[class*="newSession"], button[class*="new-session"]`。

各包内的 `sidebar-entry-core.ts` 副本由 `node scripts/sync-shared.mjs` 重新
生成（已用 `--check` 验证同步一致）。

## Testing

`shared/tests/sidebar-entry-core.spec.ts` 给 FakeElement 桩补了按类名子串
`querySelector` 与沿父链上行的 `closest`，并新增一个回归用例，按 0.1.3 真实
几何（侧栏列 > panel root > panel-area > BEM new-session 按钮）断言入口落在
按钮的实际父宿主内、紧随按钮之后、panel root 子节点数不变。
`packages/skins/skin-center/tests/skin-runtime.spec.ts` 新增 jsdom 用例，在
同一文档中同时断言两代类名都被盖上 `data-dsh-part="new-session"`。

## Alternatives considered

等上游壳把侧栏类名定下来再动。0.1.3-alpha.1 还是 pre-release，插件却已经
面向 0.1.2 代际发布；走壳侧修复意味着所有已装插件要等新 harness 版本才恢复，
且插件挂载时无法按 harness 版本做门控。双代际选择器的成本只是一条逗号。

只按新的 BEM 类名重新推导锚点。丢掉 camelCase 选择器会让仍在线上的 0.1.2
rc.x 代际壳全部失效；css-module 哈希虽然脆弱，但它仍是 0.1.2 各构建间唯一
稳定的子串。

## Consequences

插件侧栏入口与皮肤语义锚点在 0.1.2 camelCase css-module 壳与 0.1.3 BEM 壳上
都工作。若未来壳再改侧栏类名代际，扩展点就是这三处选择器（锚点查询、logo 行
`closest`、语义规则），两个回归用例即验收证据。插入宿主契约现在是"插入锚点的
实际父节点"，以后新会话按钮再被嵌套时也不必再改核心。
