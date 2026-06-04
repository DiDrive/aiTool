获取上传地址&上传分片

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Fsonz9n085gnz0n3m)

# 获取上传地址&上传分片

Back to document

&API： POST 域名 + /upload/v1/file/get\_upload\_url

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
| sliceNo | number | 必填 | 分片序号，从1开始自增 |

注：多个分片需要循环此步骤自增sliceNo+1，获取对应分片的上传地址，然后PUT上传分片

返回数据

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| presignedURL | string | 必填 | 上传地址 |

获取上传地址示例

请求示例

​

Curl

Shell

Run Code

Copy

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

JSON

Copy

PUT上传分片示例

请求示例

响应示例

无响应内容，请求响应200表示分片上传成功

POSTMAN请求示例

​

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m#CebMW)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m#KkSEp)

[获取上传地址示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m#rrPm1)

[PUT上传分片示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/sonz9n085gnz0n3m#SpRxo)