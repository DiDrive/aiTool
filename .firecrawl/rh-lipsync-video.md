\# 可灵对口型-视频生成

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /openapi/v2/kling-lip-sync/lip-sync-video:
 post:
 summary: 可灵对口型-视频生成
 deprecated: false
 description: >-
 可灵AI对口型视频生成模型，基于输入的人物识别结果视频与音频，实现人物口型与声音内容的帧级同步。支持真实人物、3D及2D动画角色，可处理本地音频上传或在线合成配音。采用音频对齐插帧策略，确保发音难度较高的音节也能准确还原口型状态，生成时长支持延伸至分钟级。
 operationId: postOpenapiV2KlingLipSyncLipSyncVideo
 tags:
 \- 标准模型API/视频生成与处理/audio-to-video
 \- 标准模型API/视频生成与处理/audio-to-video
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
 sessionId:
 type: string
 default: '865289575831703581'
 description: 会话ID，由人脸识别接口返回
 faceId:
 type: string
 default: '0'
 description: 人脸ID，由人脸识别接口返回
 audioId:
 type: string
 default: '865272148167389266'
 description: 通过语音合成接口生成的音频ID，与audioUrl二选一。仅支持30天内生成的、时长2~60秒的音频
 audioUrl:
 type: string
 format: uri
 description: \|-
 音频URL，与audioId二选一。支持.mp3/.wav/.m4a格式，文件不超过5MB，时长2~60秒

 支持的文件格式：MP3, WAV, M4A.
 soundStartTime:
 type: integer
 minimum: 0
 description: >-
 音频裁剪起点时间（单位ms）。以原始音频开始时间为准，开始时间为0分0秒，单位ms，起点之前的音频会被裁剪，裁剪后音频不得短于2秒
 soundEndTime:
 type: integer
 description: >-
 音频裁剪终点时间（单位ms）。以原始音频开始时间为准，开始时间为0分0秒，单位ms，终点之后的音频会被裁剪，裁剪后音频不得短于2秒
 soundInsertTime:
 type: integer
 minimum: 0
 description: >-
 裁剪后音频插入时间（单位ms）。插入音频时间范围需与人脸可对口型时间区间至少重合2秒，插入音频的开始时间不得早于视频开始时间，插入音频的结束时间不
 得晚于视频结束时间
 soundVolume:
 type: number
 minimum: 0
 maximum: 2
 default: 1
 description: 音频音量大小，取值范围\[0, 2\]，默认为1
 originalAudioVolume:
 type: number
 minimum: 0
 maximum: 2
 default: 1
 description: 原始视频音量大小，取值范围\[0, 2\]，默认为1。原视频无声时参数无效
 required:
 \- sessionId
 \- faceId
 \- soundStartTime
 \- soundEndTime
 \- soundInsertTime
 x-apifox-orders:
 \- sessionId
 \- faceId
 \- audioId
 \- audioUrl
 \- soundStartTime
 \- soundEndTime
 \- soundInsertTime
 \- soundVolume
 \- originalAudioVolume
 example:
 sessionId: '865289575831703581'
 faceId: '0'
 audioId: '865272148167389266'
 soundStartTime: 0
 soundEndTime: 0
 soundInsertTime: 0
 soundVolume: 1
 originalAudioVolume: 1
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
 https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/97e671c5cfd5460a1fe9ffc62788955f/2026-03-24/4b45a70dfe761ea8e9b295e65a942ec9.mp4
 outputType: mp4
 text: null
 clientId: ''
 promptTips: ''
 headers: {}
 security: \[\]
 x-sku-id: '2034581230479212554'
 x-apifox-folder: 标准模型API/视频生成与处理/audio-to-video
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-448183183-run
components:
 schemas: {}
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`