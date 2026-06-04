异步轮询获取上传结果

MD

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Fqgcosr6adkmm51h7)

# 异步轮询获取上传结果

Back to document

API： POST 域名 + /upload/v1/file/upload\_async\_result

说明：异步轮询获取上传结果

Header 参数

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| Authorization | string | 必填 | 鉴权access\_token |
| Platform | string | 必填 | 固定为:open\_platform |

Body 参数

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| preuploadID | string | 必填 | 预上传ID |

返回数据

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| completed | bool | 必填 | 上传合并是否完成,如果为false,请至少1秒后发起轮询 |
| fileID | number | 必填 | 上传完成返回对应fileID |

示例

请求示例

​

Curl

Shell

Run Code

Copy

9

1

2

3

4

5

6

7

curl--location'https://open-api.123pan.com/upload/v1/file/upload\_async\_result' \

--header'Content-Type: application/json' \

--header'Platform: open\_platform' \

--header'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJl...(过长省略)' \

--data'{

"preuploadID": "WvjyUgonimrlBq22FJ9e33be4pi04nxxWefNRwRKIqRMBxZgRxyNJ...(过长省略)"

}'

​

Java - OkHttp

​

JavaScript - jQuery

​

NodeJs - Axios

​

Python - http.client

响应示例

​

9

1

2

3

4

5

6

7

8

9

{

"code": 0,

"message": "ok",

"data": {

"fileID": 14665463,

"completed": true

},

"x-traceID": "f79fb151-8bb4-47fd-828a-d7d180a76b30\_kong-db-5898fdd8c6-t5pvc"

}

​

If you get gains，please give a like

[123云盘](https://123yunpan.yuque.com/123yunpan)

2025-06-17 05:17

659

IP region陕西

Report

386Word

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/qgcosr6adkmm51h7?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/qgcosr6adkmm51h7#LkxTi)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/qgcosr6adkmm51h7#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/qgcosr6adkmm51h7#KkSEp)

[示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/qgcosr6adkmm51h7#dCngM)