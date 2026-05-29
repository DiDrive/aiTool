\# 发起ComfyUI任务1-简易

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /task/openapi/create:
 post:
 summary: 发起ComfyUI任务1-简易
 deprecated: false
 description: 该方式运行 workflow，相当于在不改变原有workflow的任何参数的情况下，直接点了一下"运行"按钮。
 tags:
 \- ComfyUI 工作流
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
 01KQ8YZR787GTR1XWAHT36Z9VZ:
 $ref: >-
 #/components/schemas/%E5%8F%91%E8%B5%B7ComfyUI%E4%BB%BB%E5%8A%A1%20Request%201
 x-apifox-overrides: {}
 properties:
 apiKey:
 type: string
 description: ''
 examples:
 \- '{{apiKey}}'
 workflowId:
 type: string
 examples:
 \- '1904136902449209346'
 addMetadata:
 type: boolean
 description: ''
 accessPassword:
 type: string
 description: 工作流开启加密访问时使用的访问密码
 x-apifox-orders:
 \- 01KQ8YZR787GTR1XWAHT36Z9VZ
 \- accessPassword
 required:
 \- apiKey
 \- workflowId
 x-apifox-ignore-properties:
 \- apiKey
 \- workflowId
 \- addMetadata
 example:
 apiKey: '{{apiKey}}'
 workflowId: '1904136902449209346'
 responses:
 '200':
 description: ''
 content:
 application/json:
 schema:
 $ref: >-
 #/components/schemas/%E5%8F%91%E8%B5%B7ComfyUI%E4%BB%BB%E5%8A%A1%20Response
 description: ''
 example:
 code: 0
 msg: success
 data:
 netWssUrl: >-
 wss://www.runninghub.cn:443/ws/c\_instance?c\_host=10.129.240.44&c\_port=80&clientId=e825290b08ca2015b8f62f0bbdb5f5f6&workflowId=1904136902449209346&Rh-Comfy-Auth=eyJ1c2VySWQiOiJkZTBkYjZmMjU2NGM4Njk3YjA3ZGY1NWE3N2YwN2JlOSIsInNpZ25FeHBpcmUiOjE3NDM1NjQ2NTQ1NTIsInRzIjoxNzQyOTU5ODU0NTUyLCJzaWduIjoiNjVkMTVhYjA3Njg2MjJlOGM1YzJkNTc2MzQwOWFmYzkifQ%3D%3D&target=https://hbxy.runninghub.cn:11143
 taskId: '1904737800233889793'
 clientId: e825290b08ca2015b8f62f0bbdb5f5f6
 taskStatus: RUNNING
 promptTips: >-
 {"result": true, "error": null, "outputs\_to\_execute": \["9"\],
 "node\_errors": {}}
 headers: {}
 x-apifox-name: 成功
 security: \[\]
 x-apifox-folder: ComfyUI 工作流
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-425749012-run
components:
 schemas:
 发起ComfyUI任务 Request 1:
 type: object
 properties:
 apiKey:
 type: string
 description: ''
 examples:
 \- '{{apiKey}}'
 workflowId:
 type: string
 examples:
 \- '1904136902449209346'
 addMetadata:
 type: boolean
 description: ''
 x-apifox-orders:
 \- apiKey
 \- workflowId
 \- addMetadata
 required:
 \- apiKey
 \- workflowId
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 发起ComfyUI任务 Response:
 type: object
 properties:
 code:
 type: integer
 description: 返回标记：成功标记=0，非0失败，或者是功能码
 examples:
 \- 0
 msg:
 type: string
 description: 返回信息
 examples:
 \- success
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