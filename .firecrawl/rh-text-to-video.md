\# 全能视频V3.1-pro-文生视频-官方稳定版

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /openapi/v2/rhart-video-v3.1-pro-official/text-to-video:
 post:
 summary: 全能视频V3.1-pro-文生视频-官方稳定版
 deprecated: false
 description: >-
 旗舰级文生视频模型，旨在通过文本重新定义电影级叙事。该模型能生成高达 4k
 的高保真视频，并具备行业领先的原生音频同步能力，支持环境音效、配乐及角色对话（含精准口型）。结合角色一致性与视频插帧技术，Veo 3.1
 能够精准控制光影、运镜与物体动态，提供 4s/6s/8s
 多种时长及横竖屏选择，是目前最通用的生成式视频系统之一。官方稳定版，稳定高效，价格低于直接模型官方。
 operationId: postOpenapiV2RhartVideoV31ProOfficialTextToVideo
 tags:
 \- 标准模型API/视频生成与处理/text-to-video/全能视频V3.1
 \- 标准模型API/视频生成与处理/text-to-video/全能视频V3.1
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
 prompt:
 type: string
 minLength: 5
 maxLength: 8000
 default: >-
 一只精力充沛的小狗在一块鲜艳的黄色冲浪板上冲浪，乘坐汹涌的蓝色波浪。快速动作，水花四溅，戏剧化的海洋喷雾，动态镜头从侧面跟随冲浪板，阳光明媚，天空晴朗，对比度高，极其细致的毛发物理效果，逼真的波浪模拟，电影般的慢动作时刻。
 description: prompt
 aspectRatio:
 type: string
 enum:
 \- '16:9'
 \- '9:16'
 default: '9:16'
 description: aspectRatio
 x-option-metadata:
 \- value: '16:9'
 description: '16:9'
 \- value: '9:16'
 description: '9:16'
 duration:
 type: string
 enum:
 \- '4'
 \- '6'
 \- '8'
 default: '8'
 description: duration
 x-option-metadata:
 \- value: '4'
 description: '4'
 \- value: '6'
 description: '6'
 \- value: '8'
 description: '8'
 resolution:
 type: string
 enum:
 \- 720p
 \- 1080p
 \- 4k
 default: 720p
 description: resolution
 x-option-metadata:
 \- value: 720p
 description: 720p
 \- value: 1080p
 description: 1080p
 \- value: 4k
 description: 4k
 generateAudio:
 type: boolean
 default: false
 description: generateAudio
 negativePrompt:
 type: string
 description: negativePrompt
 seed:
 type: integer
 multipleOf: 1
 description: seed
 required:
 \- prompt
 \- duration
 \- resolution
 \- generateAudio
 x-apifox-orders:
 \- prompt
 \- aspectRatio
 \- duration
 \- resolution
 \- generateAudio
 \- negativePrompt
 \- seed
 example:
 prompt: >-
 一只精力充沛的小狗在一块鲜艳的黄色冲浪板上冲浪，乘坐汹涌的蓝色波浪。快速动作，水花四溅，戏剧化的海洋喷雾，动态镜头从侧面跟随冲浪板，阳光明媚，天空晴朗，对比度高，极其细致的毛发物理效果，逼真的波浪模拟，电影般的慢动作时刻。
 aspectRatio: '9:16'
 duration: '8'
 resolution: 720p
 generateAudio: false
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
 \- url: https://example.com/output.png
 outputType: png
 text: null
 clientId: ''
 promptTips: ''
 headers: {}
 security: \[\]
 x-sku-id: '2022195635475992577'
 x-apifox-folder: 标准模型API/视频生成与处理/text-to-video/全能视频V3.1
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-448183141-run
components:
 schemas: {}
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`