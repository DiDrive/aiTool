# 架构

```text
Vue 工作台 /canvas
        |
        | contextBridge MAPI / IPC
        v
Electron main: InfiniteCanvasMain
   |                    |
   | bundled            | external
   v                    v
Go API + Next server    已部署的 tigerowo 服务
127.0.0.1 动态端口       http(s) URL
   |
   v
独立 BrowserWindow（禁用 Node、启用 sandbox、拒绝权限）
```

本地模式从 `resources/extra/common/infinite-canvas/sidecar.json` 读取入口。开发时
可用 `AIGCPANEL_INFINITE_CANVAS_ROOT` 覆盖。数据库、日志和随机生成的本地管理员
凭据写入工作台数据目录的 `infinite-canvas` 子目录，不写入安装目录。

只允许画布窗口在配置服务的同源页面内导航；新窗口请求被拒绝，HTTPS 外链转交系统
浏览器。关闭工作台时终止由工作台创建的 API 和 Web 子进程。

模型配置按能力分流：工作台“模型设置”中的 OpenAI 兼容文本模型供画布 Agent 写剧本、
拆镜头和编排工具；“直连 API 平台”中的图片与视频渠道继续按各自协议生成媒体。
`textChannelId`、`imageChannelId`、`videoChannelId` 独立保存，避免跨平台串用接口。

节点式创作不新增第二套执行引擎，而是在现有 `CanvasNodeData.metadata` 增加
`workflowKind`。剧本和分镜脚本复用 Text，人物与分镜图复用 Image，视频复用 Video；
连线仍是唯一的直接依赖关系，现有生成上下文负责把上游文本和媒体传给当前节点。
右侧 Agent 创建的节点也写入同一字段，因此手工拖拽与 Agent 自动操作可混合使用。

创作节点必须是一等可见入口：底部工具栏和画布空白处右键均可直接创建，不能只依赖
双击或拖线后的隐藏菜单。空创作节点默认呈现“AI 生成”和生成要求入口；文本结果允许
人工微调，但手工文本编辑不是剧本、分镜脚本节点的主操作。

剧本节点使用 `scriptScenes` 保存场次表；分镜脚本使用 `storyboardShots` 保存镜头表。
每个镜头通过 `assetNodeIds` 绑定人物、场景、道具、分镜图和视频真实节点。素材完整度
由绑定节点是否存在可用内容实时计算，不另存容易失真的完成状态。上传素材也必须绑定到
对应依赖槽位；视频执行器在 UI 和 Agent 工具层均再次检查素材完整度。

AI 提取的人物、场景和道具是基础素材槽位，用户可为任一镜头增加 `extraAssets` 手工素材
槽位。额外槽位记录素材类别、显示名称和真实节点 ID，并与基础槽位共同参与预览、缺失
检查和生成依赖；解除绑定只清空节点 ID，不删除画布上的素材节点。

视频节点的 `videoTrim` 保存非破坏播放区间，`videoAnalysisRange` 保存本次分析区间；二者
都使用原视频绝对毫秒，分析区间默认跟随裁剪但可独立修改。倒推链路先在本地按区间生成
候选帧、去除近似重复画面并划分时间片，再逐片形成带时间码的视觉输入。最终剧本与分镜
必须保留 `startMs/endMs`，并通过人物、场景和视觉风格 ID 关联一致性档案。

用户梗概作为独立上游节点或 `adaptationBrief` 输入，只能生成新改编分支。改编模式包括
锁定结构、保留节奏和剧情优先；任何模式均保留原片解析、原片剧本和证据帧。

专业时间线编辑器保持视频源不可变，由预览监视器、播放控制、缩略图轨道、时间标尺、
播放头、裁剪轨和分析轨组成。两条范围轨分别拥有可拖拽入点/出点，分析轨始终限制在
裁剪轨内；点击定位、逐帧移动、时间线缩放以及 Space、方向键、I/O 快捷键统一使用原视频
绝对毫秒，避免预览、保存和倒推之间产生时间漂移。
