# Agent Note: 侧栏入口在嵌套壳中的插入位置

Status: implemented

## 问题

共享的侧栏入口核心（`shared/client/sidebar-entry-core.ts`）通过
`root.insertBefore(entry, anchor)` 放置插件入口行：`root` 是"新建会话"按钮
所在的侧栏根，`anchor` 是该按钮的 `nextElementSibling`（或同族块兄弟）。
这隐含假设"新建会话"按钮及其后续兄弟都是根的直接子元素。tauri panel
桌面壳把按钮再包一层（`root > panelArea > [newSession, panel actions]`），
解析出的 anchor 是 `panelArea` 的子节点而非根的子节点：`insertBefore` 抛
DOM `NotFoundError`，`mountSidebarEntry` 向外传播，看板视图连带不挂载，
任务看板的侧栏入口在该壳上静默缺失。

## 决策

`placeEntry` 现在从基准行自身解析插入容器（`base.parentElement`，回退为
root），并插入到该容器。经典壳中按钮是根的直接子节点，容器即根，行为不
变；嵌套壳则插入到真正拥有按钮及其 nextSibling 的中间 actions 容器。同族
定位逻辑改为扫描 `container.children` 而非 `root.children`，两种布局下同族
插件入口的相对顺序一致。插入失败返回 `false` 而非抛错，壳不匹配时不再拖
垮整个挂载，观察器会在下一次壳变更时重试。

改动经共享源与同步副本（`node scripts/sync-shared.mjs`）发布到
`dsh-ssh`、`dsh-task-board`、`dsh-skill-explorer`。回归测试
（`packages/dsh-task-board/tests/sidebar-entry-nested-shell.spec.ts`）用
DOM 语义镜像的 fake 复现嵌套布局（anchor 非子节点时 insertBefore 抛错），
并同时覆盖经典直子布局。

## 备选方案

- 沿按钮向上探测并特判 tauri panel 类名。否决：与具体壳的类名耦合、脆弱；
  基于 parentElement 的容器解析与布局无关，且经典壳行为逐字不变。
- 仍插到 root 但包 try/catch。否决：嵌套壳上入口仍不会出现，捕获只会掩盖
  失败。
- 失败时把入口追加到侧栏末尾。否决：壳重渲染后入口块会被随机重排，违背
  现有的"禁止末尾追加"理由。

## 后果

任务看板侧栏入口（以及共享该核心的同族插件）现在在 tauri panel 桌面壳与
经典 dsh-web 壳上都会出现在"新建会话"行与面板操作之间。运行验证：在桌面
profile 部署上打过补丁的 client bundle、刷新 GUI 后确认入口出现并能连上
Host 账本打开看板。

## 测试

`pnpm --filter @linxin666/dsh-client-ui-task-board test`（316 通过）、
`pnpm --filter @linxin666/dsh-client-ui-task-board typecheck` 与根
`pnpm typecheck`（安装范围内的包）均通过，含新增回归 spec。
