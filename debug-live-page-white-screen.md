# Debug Session: live-page-white-screen [OPEN]

## 用户现象
- 点击直播页面后卡死白屏
- 需要定位是渲染异常、初始化异常，还是同步阻塞

## 已知上下文
- 最近刚改过 `src/pages/Live/LiveMonitor.vue`
- 最近刚改过 `src/store/modules/live.ts`
- 最近新增了云端片段执行桥与模板字段

## 假设列表
1. `LiveMonitor.vue` 在挂载后调用 `liveStore.init()` / `loadScenePacks()` 时抛出运行时错误，导致页面白屏。
2. `live.ts` 读取旧版本地配置时，新字段如 `cloudClipPath` / `cloudClipRequestJson` / 片段运行态触发了未定义访问。
3. `LiveMonitor.vue` 模板中的表达式或组件树在首次渲染时访问了空对象，导致 Vue 运行时异常。
4. 某个同步流程没有报错但阻塞了主线程，例如初始化中 JSON 解析、循环调用或状态轮询异常。

## 计划
- 先收集诊断与路由/页面挂载链路
- 在现有代码中仅加入调试埋点，不修改业务逻辑
- 复现并读取运行时日志
- 基于证据定位根因后再做最小修复
