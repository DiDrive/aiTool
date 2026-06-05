# AigcPanel UI 保守改版落地计划

## 当前设计产物

- Figma 概念稿：`https://www.figma.com/design/glFYNQJiA8OlLgNP3uMv6M`
- 当前精修稿：`design/aigcpanel-refined-ui-kit.html`
- 单页概念原型：`design/aigcpanel-ui-concept.html`
- 完整多页面 UI Kit：`design/aigcpanel-full-ui-kit.html`
- 初版设计说明：`design/aigcpanel-ui-notes.md`

> Figma MCP 当前触发 Starter 计划调用次数限制，无法继续把全量页面写入 Figma。等限额恢复或升级后，可按 `aigcpanel-full-ui-kit.html` 迁移到 Figma，并拆成正式组件。

## 改版原则

本次改版应以“视觉统一 + 信息层级优化 + 组件沉淀”为主，不改变现有功能模式。

- 保留现有主导航形态、二级 tab、动态组件渲染和任务提交逻辑，但按新分类调整栏目归属。
- 保留右侧 `CloudTaskSidebar` 的数据来源和跨页面可见模式。
- 首页仍是功能入口、数据统计和常用能力集合，不强制改成新的流程中心。
- 首页去掉“模型市场 / 工单反馈 / 问题反馈”。
- 视频、声音、生图、数字人、设置页继续沿用当前左侧二级导航。
- 原“工具”改为“生图”。
- 视频栏目只保留生视频相关能力：云端生视频、Seedance 2.0。
- 生图栏目只保留生图相关能力：GPT Image 2、云端生图。
- 数字人栏目承载数字人、口型、直播片段、执行配置和直播编排相关能力。
- 去掉“一键合成”入口。
- 只在不影响业务逻辑的范围内优化布局、卡片、状态、表单、空状态和结果栏视觉。

## 页面范围

- 首页：保留欢迎标题、核心能力入口、数据统计、常用能力集合；去掉模型市场、工单反馈、问题反馈。
- 模型服务器：保留模型与平台、添加远程、添加本地、服务卡片、空状态和帮助入口。
- 视频：只放云端生视频、Seedance 2.0。
- 声音：保留 `SoundApps` 左侧二级导航和动态组件区域。
- 生图：原工具栏目改名，只放 GPT Image 2、云端生图。
- 数字人：放云端对口型、云端普通数字人、数字人直播片段、直播执行配置、数字人直播编排、知识库、控制台、互动、播报历史。
- 设置：保留基础设置、数据配置、数字人资产、环境、关于的滚动锚点模式。
- 全局任务结果栏：保留 `CloudTaskSidebar` 模式，优化为“任务排期 + 结果查看”的统一侧栏。

## 组件拆分建议

- `AppShell`：窗口标题栏、左侧主导航、中间页面容器、右侧任务结果栏槽位。
- `NavRail`：主导航图标、激活态、用户头像、设置入口。
- `PageHeader`：页面标题、说明、主要操作按钮。
- `SubNav` / `SubNavItem`：视频、声音、生图、数字人、设置页左侧二级导航。
- `TaskResultSidebar`：任务结果栏容器、折叠态、筛选态。
- `SchedulerSummaryCard`：运行中、成功、失败、排队汇总。
- `TaskResultItem`：任务名称、时间、进度、能力类型、状态、结果操作。
- `CapabilityCard`：首页能力入口。
- `ServerCard`：模型服务卡片。
- `FormPanel`：生成参数面板。
- `MediaPreviewPanel`：视频/直播/音频预览。
- `SettingRow`：设置项行。

## 可直接落地替换吗？

可以。后续我可以直接帮你把现有 UI 替换到 Vue/Electron 项目里，但会采用保守替换方式：先换视觉壳层和公共组件，不重写现有业务流程。推荐分三步：

1. 先做基础壳层：改 `src/layouts/Main.vue`、`src/components/PageNav.vue`、`src/components/cloud/CloudTaskSidebar.vue`、`src/components/cloud/CloudTaskSidebarItem.vue` 和全局样式。
2. 再逐页微调并重分组：`Home.vue`、`Server.vue`、`Video.vue`、`Sound.vue`、`Tool.vue`、`Live.vue`、`Setting.vue`，其中 `Tool.vue` 显示为“生图”，`Live.vue`/数字人入口承载口型和直播编排相关能力。
3. 最后抽组件并接数据：把重复视觉结构沉淀到 `src/components/ui/`，保证现有 store/service/task 逻辑不变。

## 风险点

- 现有代码使用 Arco Design 与 Tailwind/LESS 混合样式，改版时要避免一次性替换所有业务组件。
- 右侧任务结果栏已存在逻辑，建议保留数据层，只重做视觉和筛选布局。
- 视频/声音/生图/数字人页都是动态组件路由，需要先统一外层工作台，再逐个优化内层表单。
- 需要调整 `src/pages/Apps/all.ts` 的应用分组：Seedance 2.0 移入视频，GPT Image 2/云端生图 留在生图，口型/数字人/直播片段/执行配置/直播编排 移入数字人。
- Figma 限额恢复前，全量视觉以本地 HTML Kit 为准。
