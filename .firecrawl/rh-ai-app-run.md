\# 发起AI应用任务

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /task/openapi/ai-app/run:
 post:
 summary: 发起AI应用任务
 deprecated: false
 description: \|-
 在AI应用详情页中可查看示例nodeInfoList
 注：调用本接口生成的图片、视频等结果不带有工作流信息。
 tags:
 \- AI 应用
 parameters:
 \- name: Host
 in: header
 description: ''
 required: true
 example: www.runninghub.cn
 schema:
 type: string
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
 description: ''
 type: object
 x-apifox-refs:
 01KQ8YRKZAQ9T6CWGJ4TDY39WP:
 $ref: '#/components/schemas/TaskRunWebappByKeyRequest'
 x-apifox-overrides: {}
 properties:
 apiKey:
 type: string
 description: ''
 webappId:
 type: integer
 description: ''
 format: int64
 nodeInfoList:
 type: array
 items: &ref\_0
 $ref: '#/components/schemas/NodeInfo'
 description: com.haima.runninghub.common.model.pojo.NodeInfo
 description: ''
 webhookUrl:
 type: string
 description: ''
 instanceType:
 type: string
 description: 非必须，默认'default'调用24g显存机器，传'plus' 调用48g显存机器
 accessPassword:
 type: string
 description: AI应用开启加密访问时使用的访问密码
 x-apifox-orders:
 \- 01KQ8YRKZAQ9T6CWGJ4TDY39WP
 \- accessPassword
 required:
 \- apiKey
 \- webappId
 \- nodeInfoList
 x-apifox-ignore-properties:
 \- apiKey
 \- webappId
 \- nodeInfoList
 \- webhookUrl
 \- instanceType
 example:
 webappId: 1877265245566922800
 apiKey: '{{apiKey}}'
 nodeInfoList:
 \- nodeId: '122'
 fieldName: prompt
 fieldValue: 一个在教室里的金发女孩
 responses:
 '200':
 description: ''
 content:
 application/json:
 schema:
 $ref: '#/components/schemas/RTaskCreateResponse'
 description: ''
 example:
 code: 0
 msg: success
 data:
 netWssUrl: >-
 wss://www.runninghub.cn:443/ws/c\_instance?c\_host=222.186.161.123&c\_port=85&clientId=14caa1db2110a81629c101b9bb4cb0ce&workflowId=1876205853438365698&Rh-Comfy-Auth=eyJ1c2VySWQiOiJkZTBkYjZmMjU2NGM4Njk3YjA3ZGY1NWE3N2YwN2JlOSIsInNpZ25FeHBpcmUiOjE3NDQxMTI1MjEyMzYsInRzIjoxNzQzNTA3NzIxMjM2LCJzaWduIjoiZDExOTE0MzkwMjJlNjViMjQ5MjU2YzU2ZmQxYTUwZjUifQ%3D%3D
 taskId: '1907035719658053634'
 clientId: 14caa1db2110a81629c101b9bb4cb0ce
 taskStatus: RUNNING
 promptTips: >-
 {"result": true, "error": null, "outputs\_to\_execute":
 \["115", "129", "124"\], "node\_errors": {}}
 headers: {}
 x-apifox-name: 成功
 security: \[\]
 x-apifox-folder: AI 应用
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-425749010-run
components:
 schemas:
 NodeInfo:
 type: object
 properties:
 nodeId:
 type: string
 description: ''
 nodeName:
 type: string
 description: ''
 fieldName:
 type: string
 description: ''
 fieldValue:
 type: string
 description: ''
 fieldData:
 type: string
 description: ''
 description:
 type: string
 description: ''
 descriptionEn:
 type: string
 description: ''
 x-apifox-orders:
 \- nodeId
 \- nodeName
 \- fieldName
 \- fieldValue
 \- fieldData
 \- description
 \- descriptionEn
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 TaskRunWebappByKeyRequest:
 type: object
 properties:
 apiKey:
 type: string
 description: ''
 webappId:
 type: integer
 description: ''
 format: int64
 nodeInfoList:
 type: array
 items: \*ref\_0
 description: ''
 webhookUrl:
 type: string
 description: ''
 instanceType:
 type: string
 description: 非必须，默认'default'调用24g显存机器，传'plus' 调用48g显存机器
 x-apifox-orders:
 \- apiKey
 \- webappId
 \- nodeInfoList
 \- webhookUrl
 \- instanceType
 required:
 \- apiKey
 \- webappId
 \- nodeInfoList
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 RTaskCreateResponse:
 type: object
 properties:
 code:
 type: integer
 description: 返回标记：成功标记=0，非0失败，或者是功能码
 msg:
 type: string
 description: 返回信息
 data:
 $ref: '#/components/schemas/TaskCreateResponse'
 description: 数据
 x-apifox-orders:
 \- code
 \- msg
 \- data
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 TaskCreateResponse:
 type: object
 properties:
 netWssUrl:
 type: string
 description: Wss服务地址
 taskId:
 type: integer
 description: 任务Id
 format: int64
 clientId:
 type: string
 description: 客户端ID，当客户端首次接收clientId时，需要保存到本地，以便页面刷新重连或者二次运行任务传参使用
 taskStatus:
 type: string
 description: '任务状态: CREATE, SUCCESS, FAILED, RUNNING, QUEUED;'
 promptTips:
 type: string
 description: 工作流验证结果提示,当不为空是UI需要展示节点错误信息
 x-apifox-orders:
 \- netWssUrl
 \- taskId
 \- clientId
 \- taskStatus
 \- promptTips
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`