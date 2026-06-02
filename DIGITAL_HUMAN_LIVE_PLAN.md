# 数字人直播实施方案

更新时间：2026-05-29

## 1. 目标

- 在现有 `RunningHub / HeyGem / 其他数字人 API` 模板体系上，落地一套可持续演进的数字人直播方案。
- 第一阶段不做强实时数字人对话，优先实现：
  - 数字人身份资产沉淀
  - 片段化数字人口播生产
  - 商品展示与手持策略
  - 直播编排与播放队列

## 2. 总体架构

- `数字人身份层`
  - 维护主播一致性资产
  - 保存参考视频、待机片、讲解片、手持片、音色参考、平台侧 avatarId
- `模板能力层`
  - 继续复用现有 `CloudTemplate`
  - 支持一个模板挂多个能力，例如 `digital-human + lipsync + video`
- `片段素材层`
  - 将任务结果沉淀为直播片段
  - 片段类型包括 `idle / welcome / talk / product / holding / transition`
- `直播编排层`
  - 组合身份、待机片、欢迎片、讲解片、商品片
  - 维护切换策略、插播规则、叠层规则
- `直播执行层`
  - 按队列播放片段
  - 默认播 `idle`
  - 有新讲解片时切换到 `talk`
  - 讲完回到 `idle`

## 3. 为什么不用一步到位做实时

- `RH / HeyGem / lipsync` 当前更适合任务式生成，而不是强实时 RTC 驱动。
- 直播场景需要稳定、人物一致、镜头不跳、商品展示自然。
- 直接实时生成容易出现：
  - 形象漂移
  - 嘴型延迟
  - 手持商品穿帮
  - 前后镜头不衔接

因此首版应采用：

- `身份固定`
- `片段预生成`
- `直播时编排播放`

## 4. 商品展示策略

数字人带货不能只靠普通口播，必须补一层 `商品展示方案`。

### 4.1 推荐优先级

1. `普通口播片`
   - 适合所有商品
2. `商品插片 / 商品叠层`
   - 通过商品图、商品视频、细节 B-roll 增强展示
3. `重点商品专属手持片`
   - 只给核心 SKU 做左手持、右手持、双手持、桌面展示

### 4.2 展示模式

- `normal`
  - 普通口播
- `overlay`
  - 商品叠层展示
- `table`
  - 桌面摆放展示
- `hold-left`
  - 左手持商品
- `hold-right`
  - 右手持商品
- `hold-both`
  - 双手托举商品
- `product-clip`
  - 专属商品讲解片

## 5. 数据结构设计

### 5.1 数字人身份 `DigitalHumanIdentity`

建议字段：

- `coverImage`
- `referenceVideo`
- `idleVideo`
- `talkVideo`
- `holdLeftVideo`
- `holdRightVideo`
- `holdBothVideo`
- `tableDisplayVideo`
- `voiceRefAudio`
- `voiceRefText`
- `backgroundPrompt`
- `outfitPrompt`
- `cameraPrompt`
- `holdingPrompt`
- `productOverlayImage`
- `overlaySafeArea`
- `supportedDisplayModes`
- `bindings.runninghub.avatarId / voiceId / faceId`
- `bindings.heygem.avatarId / voiceId / speakerId`

### 5.2 直播片段 `DigitalHumanClip`

建议字段：

- `identityId`
- `identityTitle`
- `templateId`
- `templateTitle`
- `taskId`
- `capability`
- `clipType`
- `displayMode`
- `videoUrl`
- `audioUrl`
- `coverImage`
- `text`
- `productId`
- `productTitle`
- `tags`
- `durationSeconds`
- `sourceType`
- `status`

### 5.3 直播编排方案 `DigitalHumanScenePack`

建议字段：

- `identityId`
- `identityTitle`
- `idleClipId`
- `welcomeClipIds`
- `talkClipIds`
- `productClipIds`
- `transitionClipIds`
- `defaultDisplayMode`
- `autoReturnToIdle`
- `idlePaddingMs`
- `talkPaddingMs`
- `productInsertMode`
- `overlayPosition`
- `tags`
- `status`
- `notes`

## 6. 页面规划

### 6.1 设置页

- 扩展 `数字人身份`
  - 增加讲解片、左/右/双手持片、桌面展示片
  - 增加商品叠层安全区
  - 增加支持展示模式

### 6.2 数字人生成页

- 入口仍可继续挂在 `视频 -> 云端普通数字人`
- 主要流程：
  - 选择模板
  - 选择身份
  - 输入文本或上传音频
  - 选择商品展示模式
  - 提交任务
  - 任务成功后保存为直播片段

### 6.3 数字人直播编排页

- 负责管理：
  - 主播身份
  - 待机片
  - 欢迎片
  - 讲解片列表
  - 商品片列表
  - 切换规则

## 7. 直播执行规则

首版推荐固定状态机：

1. 默认播放 `idle`
2. 有欢迎片时，开播先播 `welcome`
3. 有新讲解片时，切到 `talk`
4. 讲解中可穿插 `product`
5. 讲解结束后回 `idle`
6. 若下一条片未准备好，继续播 `idle`

## 8. 分阶段实施

### 阶段 1：数据底座

- 扩展 `DigitalHumanIdentity`
- 新增 `DigitalHumanClip`
- 新增 `DigitalHumanScenePack`
- 在项目内写入方案文档

### 阶段 2：片段沉淀

- 数字人任务成功后，支持“一键保存为直播片段”
- 片段自动绑定：
  - 身份
  - 模板
  - 任务
  - 展示模式

### 阶段 3：编排页

- 增加 `数字人直播编排`
- 可选待机片、欢迎片、讲解片、商品片
- 支持切换顺序和插片规则

### 阶段 4：执行层

- 在现有直播控制台上增加片段队列
- 实现 `idle -> talk -> idle` 切换
- 再逐步支持 `product` 插播和半实时生成

## 9. 当前推进状态

### 已开始

- 已确定总体方案
- 已支持模板多能力复用
- 已接入数字人身份选择

### 本轮第一步

- 补齐身份展示姿态字段
- 新增直播片段存储结构
- 新增直播编排方案存储结构

### 本轮第二步

- 在任务结果侧栏增加“保存为直播片段”
- 支持从已成功任务直接保存为：
  - `待机片`
  - `欢迎片`
  - `讲解片`
  - `商品片`
  - `手持片`
  - `过渡片`
- 保存时可补充：
  - 绑定数字人身份
  - 展示模式
  - 商品名称 / 商品ID
  - 标签

### 本轮第三步

- 新增“数字人直播片段”管理页
- 片段页支持：
  - 列表查看
  - 按身份和片段类型筛选
  - 图片 / 视频 / 音频预览
  - 删除素材
- 新增“数字人直播编排”页面骨架
- 已在视频栏目中挂出两个入口，便于继续往编排编辑器推进

### 本轮第四步

- 将“数字人直播编排”从骨架页推进为第一版编辑器
- 当前已支持：
  - 新建 / 编辑 / 删除编排方案
  - 选择数字人身份
  - 绑定默认待机片
  - 绑定欢迎片、讲解片、商品片、过渡片
  - 配置自动回待机、前后缓冲时间、商品插播方式、叠层位置
- 片段选择已支持按当前身份过滤，避免不同主播素材混用

### 本轮第五步

- 将编排方案接入现有直播控制台基础执行层
- 当前已支持：
  - 在直播控制台选择编排方案
  - 手动切换欢迎片、讲解片、商品片、过渡片
  - 一键回待机片
  - 自动回待机计时
  - 在没有实时预览流时，用当前编排片段做本地预演
- 编排运行态已统一放入 `liveStore`，后续可以继续扩展自动轮播和半实时插播

### 本轮第六步

- 将“当前激活片段”继续接入直播执行层
- 本地直播模式下：
  - 片段切换会自动走 `scene/update`
  - 若当前片段有视频，会映射为临时 `flowVideo` 覆盖到引擎
  - 若当前片段只有文本，会在更新后补发一次 `scene/talk`
  - 本地开播时若已选编排方案，不再强依赖旧知识库里的循环视频/循环话术
- 云端模式下：
  - 先预留统一 `syncScenePackExecution` 钩子
  - 当前优先支持文本片段走 `talkCloud`
  - 视频类片段先保持控制台预演，后续再对接 RH / HeyGem 的真实切片执行

## 10. 实施原则

- 先稳定，再实时
- 先固定身份，再扩展示模式
- 先沉淀片段，再做直播编排
- 先重点商品手持，再扩展通用商品展示
