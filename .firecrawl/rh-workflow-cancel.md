\# 取消ComfyUI任务

\## OpenAPI Specification

\`\`\`yaml
openapi: 3.0.1
info:
 title: ''
 description: ''
 version: 1.0.0
paths:
 /task/openapi/cancel:
 post:
 summary: 取消ComfyUI任务
 deprecated: false
 description: ''
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
 $ref: >-
 #/components/schemas/%E6%9F%A5%E8%AF%A2%E4%BB%BB%E5%8A%A1%E7%8A%B6%E6%80%81%20Request
 description: ''
 example:
 apiKey: '{{apiKey}}'
 taskId: '1904152026220003329'
 responses:
 '200':
 description: ''
 content:
 application/json:
 schema:
 $ref: '#/components/schemas/R%3F'
 description: ''
 examples:
 '1':
 summary: 成功示例
 value:
 code: 0
 msg: success
 data: null
 '2':
 summary: 任务不存在
 value:
 code: 807
 msg: APIKEY\_TASK\_NOT\_FOUND
 data: null
 headers: {}
 x-apifox-name: 成功
 security: \[\]
 x-apifox-folder: ComfyUI 工作流
 x-apifox-status: released
 x-run-in-apifox: https://app.apifox.com/web/project/7913447/apis/api-425749015-run
components:
 schemas:
 查询任务状态 Request:
 type: object
 properties:
 apiKey:
 type: string
 description: ''
 examples:
 \- '{{apiKey}}'
 taskId:
 type: string
 description: ''
 examples:
 \- '1904152026220003329'
 x-apifox-orders:
 \- apiKey
 \- taskId
 required:
 \- apiKey
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 R?:
 type: object
 properties:
 code:
 type: integer
 description: 返回标记：成功标记=0，非0失败，或者是功能码
 msg:
 type: string
 description: 返回信息
 data:
 description: 数据
 type: 'null'
 x-apifox-orders:
 \- code
 \- msg
 \- data
 x-apifox-ignore-properties: \[\]
 x-apifox-folder: ''
 securitySchemes: {}
servers:
 \- url: https://www.runninghub.cn
 description: runninghub.cn
security: \[\]

\`\`\`