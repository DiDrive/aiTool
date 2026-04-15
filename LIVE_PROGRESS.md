# 直播模块进度总览（持续更新）

更新时间：2026-04-09

## 一、已完成

### 1) 直播状态与推流状态同步
- 已实现 mock 推流状态查询接口 `live:getMockStreamStatus`，并在前端轮询同步。
- 已修复“开播后只闪一下又回待机”的核心状态不同步问题。
- 关键位置：
  - `electron/mapi/live/main.ts`
  - `src/store/modules/live.ts`

### 2) 云端/本地分支统一
- 已统一规则：仅 `engineMode=cloud` 走 mock 推流；`engineMode=local` 统一走本地引擎分支。
- 已避免 `virtualCam` 被误判为 mock 模式导致行为不一致。
- 关键位置：
  - `src/pages/Live/LiveMonitor.vue`
  - `src/store/modules/live.ts`

### 3) 直播监控与互动链路
- 已接入弹幕监听窗口并支持抖音/B站/快手本地抓取脚本。
- 已支持前端自动回复链路：知识库匹配 → 大模型回复 → 语音/打字策略 → 队列处理。
- 已实现防回声逻辑，避免“自己发的消息再次触发自动回复”。
- 关键位置：
  - `src/pages/PageMonitor.vue`
  - `src/store/modules/live.ts`

### 4) 运营配置界面
- 已有直播互动配置页（人设、回复 Prompt、本地极速感谢话术）。
- 已有直播知识库管理页（关键词回复、系统事件、循环话术、批量添加）。
- 已有播报历史页。
- 关键位置：
  - `src/pages/Live/LiveInteraction.vue`
  - `src/pages/Live/LiveKnowledge.vue`
  - `src/pages/Live/LiveTalk.vue`

### 5) 本地渲染开播前自检与状态文案优化
- 已增加本地渲染开播前自检：服务存在、服务运行状态、`live` 能力声明。
- 已将错误提示改为可操作文案，明确引导到服务管理进行安装/启动/切换。
- 已优化“本地渲染 + 直播伴侣接入”的推流状态文案，避免误显示“未连接”。
- 关键位置：
  - `src/pages/Live/LiveMonitor.vue`

### 6) 本地引擎最小可用闭环（样例服务增强）
- 已补齐 `scene/start` / `scene/talk` / `scene/stop` / `status` / `config` 的统一接口返回结构。
- 已实现最小渲染循环线程与可打断说话状态机（开播后进入待机循环，收到 talk 进入 talking，超时自动回 idle）。
- 已支持 `AIGCPANEL_SERVER_PORT` 环境变量端口启动，适配本地服务管理器分配端口。
- 已补充 `/ping` 与 `/api/*` 兼容路由，便于调试与兼容旧调用路径。
- 关键位置：
  - `AI_Live_Server/main.py`

### 7) 本地播报完成事件回传与前端事件驱动释放
- 已在引擎输出 `AigcPanelRunResult[live][...]` 动作事件，新增 `LiveTalkStart` / `LiveTalkDone`。
- 已在前端接收并转发本地引擎动作事件，打通 `server -> renderer` 的播报完成回传链路。
- 已将本地模式队列释放由“估时 sleep”改为“等待 `LiveTalkDone` 事件”，并保留超时兜底避免卡队列。
- 关键位置：
  - `AI_Live_Server/main.py`
  - `src/store/modules/server.ts`
  - `src/store/modules/live.ts`

### 8) 本地开播依赖资源自检补全
- 已补充本地开播前依赖检查：口型模型合法性、数字人模板文件、循环话术/循环视频素材、动作库素材。
- 已补充本地引擎连通性检查（`status` 请求失败时提示端口占用或服务异常）。
- 关键位置：
  - `src/store/modules/live.ts`
  - `src/pages/Live/LiveMonitor.vue`

### 9) 云端预览链路去占位化
- 已移除云端模式固定测试视频地址 `http://localhost:5173/test.mp4`。
- 云端预览改为优先读取实时预览流地址（`liveStatus.videoHls`），无可播放地址时展示“云端渲染中”提示层。
- 已将音量控制条改为仅在存在真实可播放预览时显示，避免误导用户。
- 关键位置：
  - `src/pages/Live/LiveMonitor.vue`

### 10) 云端真实 API 适配骨架接入（可回退）
- 已新增云端接口适配：`start/stop/status` 三个调用入口（`scene/start`、`scene/stop`、`scene/status`，并兼容 `status`）。
- 已在云端模式增加配置项：`cloudApiBaseUrl`、`cloudApiKey`、`cloudSceneId`，未配置时自动回退本地 mock 推流。
- 已将云端开播/停播逻辑统一收敛到 `liveStore.startCloudStream / stopCloudStream / queryCloudStreamStatus`。
- 关键位置：
  - `electron/mapi/live/main.ts`
  - `src/store/modules/live.ts`
  - `src/pages/Live/LiveMonitor.vue`

### 11) 云端状态/错误映射与 talk 接口接入
- 已补充云端错误映射（鉴权失败、额度不足、模型不可用、超时）并统一提示文案。
- 已补充云端状态映射（`init/pending/starting/running/stopping/failed` 到前端状态机）。
- 已接入云端 `scene/talk` 调用入口，自动回复在云端模式可直接调用云端播报链路。
- 关键位置：
  - `electron/mapi/live/main.ts`
  - `src/store/modules/live.ts`

### 12) 云端多协议兼容配置增强
- 已新增云端接口路径可配置：`start/stop/status/statusFallback/talk`，支持不同云厂商的路由规范。
- 已新增云端响应字段路径可配置：`cloudPreviewFieldPath`、`cloudStatusFieldPath`，支持多候选路径（`a.b|x.y`）。
- 未配置字段路径时自动使用内置候选提取策略（兼容 `data.scene.*`、`data.scenes.0.*`、`scene.*`、`data.*`）。
- 关键位置：
  - `electron/mapi/live/main.ts`
  - `src/store/modules/live.ts`
  - `src/pages/Live/LiveMonitor.vue`

### 13) 路A落地：讯飞云适配层（本地中转）
- 已在 `AI_Live_Server/main.py` 增加讯飞适配模式（环境变量开关），将本地标准接口 `scene/start/scene/talk/scene/stop/status` 中转到讯飞 `vms2d_start/vms2d_ctrl/vms2d_stop/vms2d_ping`。
- 已实现讯飞 HTTP 签名鉴权 URL 生成（`host/date/authorization`，hmac-sha256），避免前端暴露 `apiSecret`。
- 已实现会话管理：保存 `session` 与 `stream_url`，状态查询自动保活并回填 `videoHls`。
- 已新增调试日志开关 `AIGCPANEL_XFYUN_DEBUG`，可输出脱敏后的 `start.request/start.response` 便于联调抓包。
- 默认保持兼容：未开启讯飞模式时继续走原本本地样例引擎逻辑，不影响现有调试流。
- 关键位置：
  - `AI_Live_Server/main.py`

## 二、未完成 / 半完成

### 1) 本地数字人渲染引擎仍为样例实现
- `AI_Live_Server/main.py` 已具备最小可联调闭环，但仍属于“模拟渲染状态机”，非真实模型推理链路。
- 关键 TODO 仍未落地：
  - 将 talk 任务接入真实 TTS 音频产出；
  - 接入真实口型模型（如 Wav2Lip / MuseTalk）并替换当前模拟 talking 时长；
  - 将真实生成结果稳定接入 FFmpeg 推流队列。

### 2) 本地模式仍依赖样例事件而非真实媒体回调
- 当前已改为事件驱动释放队列，但事件来源仍是样例状态机，不是底层音频/口型播放完成信号。
- 关键位置：
  - `AI_Live_Server/main.py`
  - `src/store/modules/live.ts`

### 3) 预览链路存在演示占位
- 云端预览已移除固定测试视频，并已支持读取云端状态返回的 `videoHls/previewUrl`；仍需和真实云服务对齐最终字段与鉴权规则。
- 关键位置：
  - `src/pages/Live/LiveMonitor.vue`
  - `src/store/modules/live.ts`

### 4) 工程检查存在历史噪音
- 类型检查存在历史错误（如 `TS6305`），会影响全量校验体验。

## 三、下一步 TODO（建议执行顺序）

### P1（最高优先级）
- 完成本地渲染引擎最小可用闭环：
  - 已完成：`scene/start` 启动最小主循环；
  - 已完成：`scene/talk` 可中断 talking 状态并可观测；
  - 待完成：接入真实 TTS + 口型驱动任务与真实推流。

### P2
- 引擎回调化：
  - 已完成：增加“播报完成”事件回传给前端；
  - 已完成：移除前端估时释放队列逻辑，改为事件驱动；
  - 待完成：将 `LiveTalkDone` 的触发源替换为真实音频/口型任务完成回调。

### P3
- 统一错误提示与自检：
  - 已完成：本地渲染开播前检查服务在线、能力声明；
  - 已完成：错误提示改为可操作文案（告诉用户怎么修）；
  - 已完成：补充依赖资源检查（模型/素材/端口连通性与素材文件可用性）。

### P4
- 回归测试矩阵：
  - 本地渲染 + RTMP；
  - 本地渲染 + 直播伴侣接入；
  - 云端渲染 + RTMP / virtualCam；
  - 弹幕抓取三平台（抖音/B站/快手）。

## 四、回顾用短结论
- 当前状态：前端直播控制与互动链路“可演示可联调”，本地渲染引擎“待实装”。
- 若目标是“稳定可商用直播”，下一阶段关键工作重心应放在本地引擎真实渲染闭环与事件回传机制。

## 五、下一阶段详细实施计划（云端先行 + 本地实装）

### 阶段 A：云端真实链路落地（先做）
- 目标：
  - 将当前云端“演示占位链路”切换为真实云服务链路，确保 `start/stop/status/talk` 可用且状态可观测。
- 任务清单：
  - 对齐云端接口协议：确认鉴权参数、模型参数、推流参数、错误码结构；
  - 在 `engineMode=cloud` 分支接入真实 API，移除固定演示资源依赖；
  - 统一状态映射：将云端返回状态映射到 `starting/running/stopping/error`；
  - 完善失败路径：鉴权失败、配额不足、模型不可用、网络超时的可操作提示；
  - 保留并复用现有前端互动链路，确保弹幕回复策略不回退。
- 验收标准：
  - 云端模式下可完成开播、停播、语音播报、状态轮询；
  - 异常场景下 UI 提示可直接指导用户修复；
  - 不影响本地模式既有可用能力。
- 关键位置（预计）：
  - `src/pages/Live/LiveMonitor.vue`
  - `src/store/modules/live.ts`
  - `electron/mapi/live/main.ts`

### 阶段 B：本地真实模型安装与任务接线
- 目标：
  - 将 `AI_Live_Server/main.py` 从样例状态机替换为真实“文本 -> TTS -> 口型驱动 -> 推流”链路。
- 任务清单：
  - 模型资源准备：
    - 明确并固化模型目录、素材目录、缓存目录；
    - 启动前校验模型文件存在性、版本兼容性与读写权限；
  - TTS 实装：
    - 接入真实 TTS 产出音频文件与时长元数据；
    - 为播报任务生成可追踪任务 ID 与生命周期状态；
  - 口型驱动实装：
    - 接入真实口型模型推理，基于音频驱动视频片段；
    - 输出可推流的视频流或中间产物并接入 FFmpeg；
  - 事件回传升级：
    - 将 `LiveTalkDone` 触发源从“估算时长”切到“真实媒体播放完成”；
    - 保留 `LiveTalkStart/LiveTalkError/LiveTalkDone` 全链路可观测日志；
  - 推流稳定性：
    - 增加任务取消、引擎重启、连续播报场景的状态恢复能力。
- 验收标准：
  - 本地模式播报时长与真实媒体时长一致，队列无提前/延后释放；
  - 连续高频播报场景队列稳定，不丢任务、不死锁；
  - 停播/重启后可恢复到可继续开播状态。
- 关键位置（预计）：
  - `AI_Live_Server/main.py`
  - `src/store/modules/live.ts`
  - `src/store/modules/server.ts`

### 阶段 C：联调与回归（覆盖云端+本地）
- 回归范围：
  - 本地渲染 + RTMP；
  - 本地渲染 + 直播伴侣接入；
  - 云端渲染 + RTMP；
  - 云端渲染 + virtualCam；
  - 弹幕抓取三平台（抖音/B站/快手）。
- 用例重点：
  - 连续弹幕触发下的语音/打字混合回复；
  - 直播中断、服务重启、端口变化后的恢复行为；
  - 错误文案是否准确、是否有明确下一步操作指引。
- 输出产物：
  - 问题清单（按严重级别）；
  - 修复清单（按模块）；
  - 最终可发布的“稳定版本基线”。

### 阶段 D：上线准备与切换策略
- 发布前准备：
  - 固化默认配置（模型、推流、回复策略）；
  - 补充关键日志指标（开播成功率、播报失败率、任务堆积长度）；
  - 完成一次全链路冒烟检查。
- 切换策略：
  - 先灰度云端真实链路，再切换本地真实模型链路；
  - 保留回退开关：异常时可退回当前可用分支；
  - 每次切换后执行最小回归集，确保不影响直播主路径。
