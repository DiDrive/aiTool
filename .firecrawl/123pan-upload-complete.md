上传完毕

MD

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Fhkdmcmvg437rfu6x)

# 上传完毕

Back to document

API： POST 域名 + /upload/v1/file/upload\_complete

说明：文件上传完成后请求

建议:

调用该接口前,请优先列举已上传的分片,在本地进行 md5 比对。

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
| async | bool | 必填 | 是否需要异步查询上传结果。false为无需异步查询,已经上传完毕。true 为需要异步查询上传结果。 |
| completed | bool | 必填 | 上传是否完成 |
| fileID | number | 必填 | 上传完成文件id |

示例

请求示例

​

Curl

9

1

2

3

4

5

6

7

curl--location'https://open-api.123pan.com/upload/v1/file/upload\_complete' \

--header'Content-Type: application/json' \

--header'Platform: open\_platform' \

--header'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJl...(过长省略)' \

--data'{

"preuploadID": "WvjyUgonimrlBq22FJ9e33be4pi04nxxWefNRwRKIqRMBxZg...(过长省略)"

}'

响应示例

​

If you get gains，please give a like

[123云盘](https://123yunpan.yuque.com/123yunpan)

2025-06-17 05:17

873

IP region陕西

Report

433Word

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[建议:](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x#yHN1m)

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x#Xdi4T)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x#KkSEp)

[示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/hkdmcmvg437rfu6x#bsXFI)