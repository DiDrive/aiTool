# [OPEN] runninghub-submit

## 症状
- 点击“开始生成”后，用户没有在页面上看到明确的运行过程。
- RunningHub 后台没有出现对应任务记录。

## 预期
- 点击“开始生成”后，本地应立即出现一条任务记录，并显示当前步骤。
- 如果成功提交到 RunningHub，应出现 `RH Task ID`，且后台可见任务。

## 可证伪假设
1. 任务在前端校验或构建阶段失败，`TaskService.submit()` 没有真正执行。
2. 任务已写入本地任务表，但页面没有刷新到这条记录，导致用户看不到“运行过程”。
3. 任务卡在 `Prepare/UploadAssets`，因此还没走到 `runninghub:runTask`，RH 后台不会出现记录。
4. `runninghub:runTask` 被调用了，但接口参数或路径不对，Electron 侧返回错误且只落在本地任务状态里。
5. 提交其实成功，但用户当前看的页面不是这条任务记录所在区域，或记录被旧分页/旧排序淹没。

## 当前静态观察
- 任务列表渲染位置在 `src/components/cloud/CloudCapabilityPage.vue` 底部。
- 任务卡片运行过程显示在 `src/pages/Apps/RunningHubStudio/components/RunningHubStudioItem.vue`。
- `TaskService.submit(record)` 后会执行本地刷新，但仍需运行时证据确认记录是否真的创建并进入 `runFunc`。

## 运行时证据
- 用户反馈按钮下方显示“进入本地队列”，可排除前端点击前校验失败与 `TaskService.submit()` 直接报错。
- 直接查询 `C:\Users\njbase-012\AppData\Roaming\shuzhi-yinxiang\data\database.db`：
  - `data_task` 中已存在多条 `biz = RunningHubTask` 记录。
  - 最新记录 `status = fail`，并非“未创建任务”。
- 最新三条任务的 `jobResult` 均停在：
  - `step = Prepare`
  - `Prepare.status = fail`
  - `Submit.status = queue`
- 最新错误信息：
  - `Bad escaped character in JSON at position 75 (line 5 column 23)`

## 假设结论
1. 任务在前端校验或构建阶段失败，`TaskService.submit()` 没有真正执行。
   - 结论：否。用户已看到“进入本地队列”。
2. 任务已写入本地任务表，但页面没有刷新到这条记录，导致用户看不到“运行过程”。
   - 结论：部分成立。任务确实已入库，但页面显示仍需后续单独核对。
3. 任务卡在 `Prepare/UploadAssets`，因此还没走到 `runninghub:runTask`，RH 后台不会出现记录。
   - 结论：是。数据库证据显示卡在 `Prepare`。
4. `runninghub:runTask` 被调用了，但接口参数或路径不对，Electron 侧返回错误且只落在本地任务状态里。
   - 结论：否。`Submit` 尚未开始。
5. 提交其实成功，但用户当前看的页面不是这条任务记录所在区域，或记录被旧分页/旧排序淹没。
   - 结论：否。任务状态已明确为失败。

## 根因判断
- `nodeInfoListJson` / `requestBodyJson` 的占位符替换没有做 JSON 安全转义。
- Windows 本地路径如 `C:\Users\...` 被直接写入 JSON 字符串后，反斜杠触发非法转义，导致 `Prepare` 阶段解析 JSON 失败。

## 下一步
- 先做最小修复：模板变量替换时对字符串做 JSON 安全转义。
- 修复后再次复现，验证任务能否越过 `Prepare` 并拿到 `RH Task ID`。
