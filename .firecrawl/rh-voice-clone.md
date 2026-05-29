\# minimax/voice-clone

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /openapi/v2/rhart-audio/text-to-audio/voice-clone:
 post:
 summary: minimax/voice-clone
 deprecated: false
 description: >-
 基于 Speech-02 与最新 Speech 2.6 HD/Turbo
 系列打造的尖端声纹克隆引擎。它仅需数秒音频样本即可实现高保真的零样本克隆，精准复刻目标说话人的音色、口音与独特的叙事风格。该系统不仅支持全球
 40 多种语言的跨语言流畅合成，更在情感表达力上实现了质的飞跃，允许开发者对语速、音高及情感色彩进行细粒度调节。凭借 Turbo 版本低于
 250ms 的极低延迟性能，它成为了实时交互、沉浸式游戏及全球化品牌播报的理想音频解决方案。
 operationId: postOpenapiV2RhartAudioTextToAudioVoiceClone
 tags:
 \- 标准模型API/音频生成与处理/text-to-audio
 \- 标准模型API/音频生成与处理/text-to-audio
 parameters:
 \- name: Content-Type
 in: header
 description: ''
 required: false
 example: application/json
 schema:
 type: string
 default: application/json
 \- name: Authorization
 in: header
 description: ''
 required: true
 example: Bearer \[Your API KEY\]
 schema:
 type: string
 default: Bearer \[Your API KEY\]
 requestBody:
 content:
 application/json:
 schema:
 type: object
 properties:
 audio:
 type: string
 format: uri
 default: >-
 https://www.runninghub.cn/view?filename=8ff07bf7a789afcbe91a8da77a07d2ef8d8137a65a6e60bb956a1d0fcbf319b7.wav&type=input&subfolder=&Rh-Comfy-Auth=eyJ1c2VySWQiOiIzZjY1MTNlNWEwNjY1N2I4OGYyNjU5NTEzYmU3ZDM0YyIsInNpZ25FeHBpcmUiOjE3NzE0MDg4OTQ3MjksInRzIjoxNzcwODA0MDk0NzI5LCJzaWduIjoiZGI3MmMwZTgxYjM5ZmNkYzMxNzlkNDBmYTczNDE0ZWEifQ==&Rh-Identify=3f6513e5a06657b88f2659513be7d34c&rand=0.06611614675835809
 description: \|-
 audio

 支持的文件格式：MP3, WAV.
 custom\_voice\_id:
 type: string
 default: Elegant\_Man
 description: >-
 自定义用户定义 ID：必须至少有 8
 个字符，以字母开头，并包括字母和数字（例如，RH-20250717-1050）。重复的语音 ID 将导致错误。此 ID
 可用于以下型号：minimax/speech-02-hd minimax/speech-02-turbo
 text:
 type: string
 default: >-
 基于 Speech-02 与最新 Speech 2.6 HD/Turbo
 系列打造的尖端声纹克隆引擎。它仅需数秒音频样本即可实现高保真的零样本（Zero-shot）克隆，精准复刻目标说话人的音色、口音与独特的叙事风格。
 description: 你好！欢迎来到 RunningHub！这是您克隆的声音预览。希望您喜欢！
 accuracy:
 type: number
 minimum: 0
 maximum: 1
 multipleOf: 0.1
 default: 0.7
 description: accuracy
 need\_noise\_reduction:
 type: boolean
 default: false
 description: \|-
 need\_noise\_reduction

 checked=true / unchecked=false
 need\_volume\_normalization:
 type: boolean
 default: false
 description: \|-
 need\_volume\_normalization

 checked=true / unchecked=false
 model:
 type: string
 enum:
 \- speech-02-hd
 \- speech-02-turbo
 \- speech-2.5-hd-preview
 \- speech-2.5-turbo-preview
 \- speech-2.6-hd
 \- speech-2.6-turbo
 \- speech-2.8-turbo
 \- speech-2.8-hd
 default: speech-02-hd
 description: >-
 指定用于预览的 TTS 模型。这只是克隆后的预览。模型生成后，任何 Minimax Turbo 或 HD
 语音模型都可用于推理。
 x-option-metadata:
 \- value: speech-02-hd
 description: speech-02-hd
 \- value: speech-02-turbo
 description: speech-02-turbo
 \- value: speech-2.5-hd-preview
 description: speech-2.5-hd-preview
 \- value: speech-2.5-turbo-preview
 description: speech-2.5-turbo-preview
 \- value: speech-2.6-hd
 description: speech-2.6-hd
 \- value: speech-2.6-turbo
 description: speech-2.6-turbo
 \- value: speech-2.8-turbo
 description: speech-2.8-turbo
 \- value: speech-2.8-hd
 description: speech-2.8-hd
 language\_boost:
 type: string
 enum:
 \- Chinese
 \- Chinese,Yue
 \- English
 \- Arabic
 \- Russian
 \- Spanish
 \- French
 \- Portuguese
 \- German
 \- Turkish
 \- Dutch
 \- Ukrainian
 \- Vietnamese
 \- Indonesian
 \- Japanese
 \- Italian
 \- Korean
 \- Thai
 \- Polish
 \- Romanian
 \- Greek
 \- Czech
 \- Finnish
 \- Hindi
 \- auto
 description: 增强对指定语言和方言的识别能力
 x-option-metadata:
 \- value: Chinese
 description: Chinese
 \- value: Chinese,Yue
 description: Chinese,Yue
 \- value: English
 description: English
 \- value: Arabic
 description: Arabic
 \- value: Russian
 description: Russian
 \- value: Spanish
 description: Spanish
 \- value: French
 description: French
 \- value: Portuguese
 description: Portuguese
 \- value: German
 description: German
 \- value: Turkish
 description: Turkish
 \- value: Dutch
 description: Dutch
 \- value: Ukrainian
 description: Ukrainian
 \- value: Vietnamese
 description: Vietnamese
 \- value: Indonesian
 description: Indonesian
 \- value: Japanese
 description: Japanese
 \- value: Italian
 description: Italian
 \- value: Korean
 description: Korean
 \- value: Thai
 description: Thai
 \- value: Polish
 description: Polish
 \- value: Romanian
 description: Romanian
 \- value: Greek
 description: Greek
 \- value: Czech
 description: Czech
 \- value: Finnish
 description: Finnish
 \- value: Hindi
 description: Hindi
 \- value: auto
 description: auto
 required:
 \- audio
 \- custom\_voice\_id
 \- text
 \- need\_noise\_reduction
 \- need\_volume\_normalization
 \- model
 x-apifox-orders:
 \- audio
 \- custom\_voice\_id
 \- text
 \- accuracy
 \- need\_noise\_reduction
 \- need\_volume\_normalization
 \- model
 \- language\_boost
 example:
 audio: >-
 https://www.runninghub.cn/view?filename=8ff07bf7a789afcbe91a8da77a07d2ef8d8137a65a6e60bb956a1d0fcbf319b7.wav&type=input&subfolder=&Rh-Comfy-Auth=eyJ1c2VySWQiOiIzZjY1MTNlNWEwNjY1N2I4OGYyNjU5NTEzYmU3ZDM0YyIsInNpZ25FeHBpcmUiOjE3NzE0MDg4OTQ3MjksInRzIjoxNzcwODA0MDk0NzI5LCJzaWduIjoiZGI3MmMwZTgxYjM5ZmNkYzMxNzlkNDBmYTczNDE0ZWEifQ==&Rh-Identify=3f6513e5a06657b88f2659513be7d34c&rand=0.06611614675835809
 custom\_voice\_id: Elegant\_Man
 text: >-
 基于 Speech-02 与最新 Speech 2.6 HD/Turbo
 系列打造的尖端声纹克隆引擎。它仅需数秒音频样本即可实现高保真的零样本（Zero-shot）克隆，精准复刻目标说话人的音色、口音与独特的叙事风格。
 accuracy: 0.7
 need\_noise\_reduction: false
 need\_volume\_normalization: false
 model: speech-02-hd
 responses:
 '200':
 x-apifox-name: 成功
 x-apifox-ordering: 0
 description:  任务结果查询接口：\`/openapi/v2/query\`
 content:
 application/json:
 schema:
 type: object
 properties:
 taskId:
 type: string
 description: 任务 ID，用于后续查询任务结果。
 status:
 type: string
 enum:
 \- QUEUED
 \- RUNNING
 \- SUCCESS
 \- FAILED
 description: 任务状态。
 errorCode:
 type: string
 description: 错误码。
 errorMessage:
 type: string
 description: 错误信息。
 results:
 type: array
 items:
 type: object
 properties:
 url:
 type: string
 description: 输出文件 URL。
 nullable: true
 outputType:
 type: string
 description: 输出类型或文件扩展名。
 nullable: true
 text:
 type: string
 description: 文本输出内容。
 nullable: true
 x-apifox-orders:
 \- url
 \- outputType
 \- text
 description: 任务输出结果列表；处理中时可能为 null。
 nullable: true
 clientId:
 type: string
 description: 客户端标识。
 promptTips:
 type: string
 description: 提示词执行反馈，使用 JSON 字符串承载。
 failedReason:
 type: object
 additionalProperties: true
 description: 失败详情对象。
 x-apifox-orders: \[\]
 nullable: true
 usage:
 type: object
 description: 计费与耗时信息。
 properties:
 thirdPartyConsumeMoney:
 type: string
 description: 第三方消耗金额。
 nullable: true
 consumeMoney:
 type: string
 description: 平台消耗金额。
 nullable: true
 consumeCoins:
 type: string
 description: 平台消耗点数。
 nullable: true
 taskCostTime:
 type: string
 description: 任务耗时。
 nullable: true
 x-apifox-orders:
 \- thirdPartyConsumeMoney
 \- consumeMoney
 \- consumeCoins
 \- taskCostTime
 nullable: true
 required:
 \- taskId
 \- status
 \- errorCode
 \- errorMessage
 \- results
 \- clientId
 \- promptTips
 x-apifox-orders:
 \- taskId
 \- status
 \- errorCode
 \- errorMessage
 \- results
 \- clientId
 \- promptTips
 \- failedReason
 \- usage
 examples:
 taskSubmitted:
 summary: 提交任务响应示例
 value:
 taskId: '2013508786110730241'
 status: RUNNING
 errorCode: ''
 errorMessage: ''
 results: null
 clientId: f828b9af25161bc066ef152db7b29ccc
 promptTips: >-
 {"result": true, "error": null, "outputs\_to\_execute":
 \["4"\], "node\_errors": {}}
 taskSucceeded:
 summary: 任务完成（查询状态接口）响应示例
 value:
 taskId: '2013508786110730241'
 status: SUCCESS
 errorCode: ''
 errorMessage: ''
 failedReason: {}
 usage:
 consumeMoney: null
 consumeCoins: null
 taskCostTime: '0'
 thirdPartyConsumeMoney: null
 results:
 \- url: >-
 https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/22820eb19d5010de41dbf6856e984340/2026-02-11/96b7a4a41a756cdfd0764966ec7c45f3.mp3
 outputType: mp3
 text: null
 clientId: ''
 promptTips: ''
 headers: {}
 security: \[\]
 x-sku-id: '2021514824548372482'
 x-apifox-folder: 标准模型API/音频生成与处理/text-to-audio
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-448183274-run
components:
 schemas: {}
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`