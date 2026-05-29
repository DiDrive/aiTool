\# 可灵对口型-语音合成

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /openapi/v2/kling-lip-sync/tts:
 post:
 summary: 可灵对口型-语音合成
 deprecated: false
 description: >-
 可灵推出的支持文本到语音转换的生成模型，提供多语言、多方言的合成能力。可基于文本描述生成在线配音，或结合自定义音色功能复刻特定人声。支持语速调节（0.8-2倍速）、多种情感风格选择，并能与对口型模型联动，实现音画同步的口型驱动。
 operationId: postOpenapiV2KlingLipSyncTts
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
 maxLength: 1000
 default: >-
 欢迎使用可灵对口型模型，可基于人脸识别结果和音频，生成唇形同步的视频，保持人物一致性，生成想要的音频，让人物去对口型。这就是用可灵对口型模型生成的视频哦。
 description: 合成音频的文案。文本内容最大长度1000，内容过长会返回错误
 voiceId:
 type: string
 enum:
 \- genshin\_vindi2
 \- zhinen\_xuesheng
 \- tiyuxi\_xuedi
 \- ai\_shatang
 \- genshin\_klee2
 \- genshin\_kirara
 \- ai\_kaiya
 \- tiexin\_nanyou
 \- ai\_chenjiahao\_712
 \- girlfriend\_1\_speech02
 \- chat1\_female\_new-3
 \- girlfriend\_2\_speech02
 \- cartoon-boy-07
 \- cartoon-girl-01
 \- ai\_huangyaoshi\_712
 \- you\_pingjing
 \- ai\_laoguowang\_712
 \- chengshu\_jiejie
 \- zhuxi\_speech02
 \- uk\_oldman3
 \- laopopo\_speech02
 \- heainainai\_speech02
 \- dongbeilaotie\_speech02
 \- chongqingxiaohuo\_speech02
 \- chuanmeizi\_speech02
 \- chaoshandashu\_speech02
 \- ai\_taiwan\_man2\_speech02
 \- xianzhanggui\_speech02
 \- tianjinjiejie\_speech02
 \- diyinnansang\_DB\_CN\_M\_04-v2
 \- yizhipiannan-v1
 \- guanxiaofang-v2
 \- tianmeixuemei-v1
 \- daopianyansang-v1
 \- mengwa-v1
 \- AOT
 \- oversea\_male1
 \- girlfriend\_4\_speech02
 \- chat\_0407\_5-1
 \- uk\_boy1
 \- PeppaPig\_platform
 \- ai\_huangzhong\_712
 \- calm\_story1
 \- uk\_man2
 \- reader\_en\_m-v1
 \- commercial\_lady\_en\_f-v1
 default: genshin\_klee2
 description: >-
 音色ID。系统提供多种音色可供选择，具体音色效果和音色ID对应关系请参考官方文档：https://docs.qingque.cn/s/home/eZQDvafJ4vXQkP8T9ZPvmye8S?identityId=2E1MlYrrPk4
 x-option-metadata:
 \- value: genshin\_vindi2
 description: genshin\_vindi2
 \- value: zhinen\_xuesheng
 description: zhinen\_xuesheng
 \- value: tiyuxi\_xuedi
 description: tiyuxi\_xuedi
 \- value: ai\_shatang
 description: ai\_shatang
 \- value: genshin\_klee2
 description: genshin\_klee2
 \- value: genshin\_kirara
 description: genshin\_kirara
 \- value: ai\_kaiya
 description: ai\_kaiya
 \- value: tiexin\_nanyou
 description: tiexin\_nanyou
 \- value: ai\_chenjiahao\_712
 description: ai\_chenjiahao\_712
 \- value: girlfriend\_1\_speech02
 description: girlfriend\_1\_speech02
 \- value: chat1\_female\_new-3
 description: chat1\_female\_new-3
 \- value: girlfriend\_2\_speech02
 description: girlfriend\_2\_speech02
 \- value: cartoon-boy-07
 description: cartoon-boy-07
 \- value: cartoon-girl-01
 description: cartoon-girl-01
 \- value: ai\_huangyaoshi\_712
 description: ai\_huangyaoshi\_712
 \- value: you\_pingjing
 description: you\_pingjing
 \- value: ai\_laoguowang\_712
 description: ai\_laoguowang\_712
 \- value: chengshu\_jiejie
 description: chengshu\_jiejie
 \- value: zhuxi\_speech02
 description: zhuxi\_speech02
 \- value: uk\_oldman3
 description: uk\_oldman3
 \- value: laopopo\_speech02
 description: laopopo\_speech02
 \- value: heainainai\_speech02
 description: heainainai\_speech02
 \- value: dongbeilaotie\_speech02
 description: dongbeilaotie\_speech02
 \- value: chongqingxiaohuo\_speech02
 description: chongqingxiaohuo\_speech02
 \- value: chuanmeizi\_speech02
 description: chuanmeizi\_speech02
 \- value: chaoshandashu\_speech02
 description: chaoshandashu\_speech02
 \- value: ai\_taiwan\_man2\_speech02
 description: ai\_taiwan\_man2\_speech02
 \- value: xianzhanggui\_speech02
 description: xianzhanggui\_speech02
 \- value: tianjinjiejie\_speech02
 description: tianjinjiejie\_speech02
 \- value: diyinnansang\_DB\_CN\_M\_04-v2
 description: diyinnansang\_DB\_CN\_M\_04-v2
 \- value: yizhipiannan-v1
 description: yizhipiannan-v1
 \- value: guanxiaofang-v2
 description: guanxiaofang-v2
 \- value: tianmeixuemei-v1
 description: tianmeixuemei-v1
 \- value: daopianyansang-v1
 description: daopianyansang-v1
 \- value: mengwa-v1
 description: mengwa-v1
 \- value: AOT
 description: AOT
 \- value: oversea\_male1
 description: oversea\_male1
 \- value: girlfriend\_4\_speech02
 description: girlfriend\_4\_speech02
 \- value: chat\_0407\_5-1
 description: chat\_0407\_5-1
 \- value: uk\_boy1
 description: uk\_boy1
 \- value: PeppaPig\_platform
 description: PeppaPig\_platform
 \- value: ai\_huangzhong\_712
 description: ai\_huangzhong\_712
 \- value: calm\_story1
 description: calm\_story1
 \- value: uk\_man2
 description: uk\_man2
 \- value: reader\_en\_m-v1
 description: reader\_en\_m-v1
 \- value: commercial\_lady\_en\_f-v1
 description: commercial\_lady\_en\_f-v1
 voiceLanguage:
 type: string
 enum:
 \- zh
 \- en
 default: zh
 description: 音色语种，与音色ID对应。默认为zh
 x-option-metadata:
 \- value: zh
 description: zh (中文)
 \- value: en
 description: en (英文)
 voiceSpeed:
 type: number
 minimum: 0.8
 maximum: 2
 multipleOf: 0.1
 default: 1
 description: 语速，默认为1.0。有效范围0.8~2.0，精确至小数点后1位
 required:
 \- text
 \- voiceId
 \- voiceLanguage
 x-apifox-orders:
 \- text
 \- voiceId
 \- voiceLanguage
 \- voiceSpeed
 example:
 text: >-
 欢迎使用可灵对口型模型，可基于人脸识别结果和音频，生成唇形同步的视频，保持人物一致性，生成想要的音频，让人物去对口型。这就是用可灵对口型模型生成的视频哦。
 voiceId: genshin\_klee2
 voiceLanguage: zh
 voiceSpeed: 1
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
 \- url: null
 outputType: text
 text: '865272148167389266'
 clientId: ''
 promptTips: ''
 headers: {}
 security: \[\]
 x-sku-id: '2034581230479212553'
 x-apifox-folder: 标准模型API/音频生成与处理/text-to-audio
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-448183273-run
components:
 schemas: {}
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`