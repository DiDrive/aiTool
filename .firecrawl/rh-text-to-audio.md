\# minimax/speech-2.8-turbo

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /openapi/v2/rhart-audio/text-to-audio/speech-2.8-turbo:
 post:
 summary: minimax/speech-2.8-turbo
 deprecated: false
 description: >-
 一款重新定义人机交互的广播级文本转语音模型。它不仅能提供极其自然、丝滑的听感，更赋予了 AI
 情绪的深度——从欢快的语调到冷静的叙述，皆可精准驾驭。通过内置的 17+
 种多元音色库和独特的拟人化语气助词（如笑声、叹息），它让语音合成告别“机械感”，实现更具生命力的表达。无论是品牌播报、有声书创作还是实时语音助手，其精细的参数控制和自定义词典功能，都能为你提供量身定制的顶级听觉盛宴。
 operationId: postOpenapiV2RhartAudioTextToAudioSpeech28Turbo
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
 text:
 type: string
 default: >-
 大家好！欢迎来到 MiniMax (发音：Mini-Max) 科技频道。 今天我们要聊聊这款超酷的 Speech 2.8
 Turbo。它甚至能听出我的疲惫，比如这样。但没关系！只要设定好 48kHz
 的采样率，它就能立刻恢复元气，为全世界提供最棒的声音！是不是很神奇？
 description: >-
 Supported interjections: (laughs), (chuckle), (coughs),
 (clear-throat), (groans), (breath), (pant), (inhale),
 (exhale), (gasps), (sniffs), (sighs), (snorts), (burps),
 (lip-smacking), (humming), (hissing), (emm), (whistles),
 (sneezes), (crying), (applause).
 pronunciation\_dict:
 type: array
 items:
 type: string
 maxItems: 20
 default:
 \- ASAP/As soon as possible
 description: pronunciation\_dict
 voice\_id:
 type: string
 default: Elegant\_Man
 description: >-
 system voice IDs: Wise\_Woman, Friendly\_Person,
 Inspirational\_girl, Deep\_Voice\_Man, Calm\_Woman, Casual\_Guy,
 Lively\_Girl, Patient\_Man, Young\_Knight, Determined\_Man,
 Lovely\_Girl, Decent\_Boy, Imposing\_Manner, Elegant\_Man,
 Abbess, Sweet\_Girl\_2, Exuberant\_Girl
 speed:
 type: number
 minimum: 0.5
 maximum: 2
 multipleOf: 0.01
 default: 1
 description: speed
 volume:
 type: number
 minimum: 0.1
 maximum: 10
 multipleOf: 0.01
 default: 1
 description: volume
 pitch:
 type: integer
 minimum: -12
 maximum: 12
 multipleOf: 1
 default: 0
 description: pitch
 emotion:
 type: string
 enum:
 \- happy
 \- sad
 \- angry
 \- fearful
 \- disgusted
 \- surprised
 \- neutral
 default: happy
 description: emotion
 x-option-metadata:
 \- value: happy
 description: happy
 \- value: sad
 description: sad
 \- value: angry
 description: angry
 \- value: fearful
 description: fearful
 \- value: disgusted
 description: disgusted
 \- value: surprised
 description: surprised
 \- value: neutral
 description: neutral
 enable\_base64\_output:
 type: boolean
 default: false
 description: \|-
 enable\_base64\_output

 checked=true / unchecked=false
 english\_normalization:
 type: boolean
 default: false
 description: \|-
 english\_normalization

 checked=true / unchecked=false
 required:
 \- text
 \- voice\_id
 \- enable\_base64\_output
 \- english\_normalization
 x-apifox-orders:
 \- text
 \- pronunciation\_dict
 \- voice\_id
 \- speed
 \- volume
 \- pitch
 \- emotion
 \- enable\_base64\_output
 \- english\_normalization
 example:
 text: >-
 大家好！欢迎来到 MiniMax (发音：Mini-Max) 科技频道。 今天我们要聊聊这款超酷的 Speech 2.8
 Turbo。它甚至能听出我的疲惫，比如这样。但没关系！只要设定好 48kHz
 的采样率，它就能立刻恢复元气，为全世界提供最棒的声音！是不是很神奇？
 pronunciation\_dict:
 \- ASAP/As soon as possible
 voice\_id: Elegant\_Man
 speed: 1
 volume: 1
 pitch: 0
 emotion: happy
 enable\_base64\_output: false
 english\_normalization: false
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
 https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/22820eb19d5010de41dbf6856e984340/2026-02-07/5a060bfed2f626d3e3b743b6499e2bd1.mp3
 outputType: mp3
 text: null
 clientId: ''
 promptTips: ''
 headers: {}
 security: \[\]
 x-sku-id: '2019027887547813889'
 x-apifox-folder: 标准模型API/音频生成与处理/text-to-audio
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-448183271-run
components:
 schemas: {}
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`