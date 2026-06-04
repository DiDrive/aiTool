获取直链链接

MD

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Ftdxfsmtemp4gu4o2)

# 获取直链链接

Back to document

API： GET 域名 + /api/v1/direct-link/url

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
| fileID | number | 必填 | 需要获取直链链接的文件的fileID |

返回数据

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| url | string | 必填 | 文件对应的直链链接 |

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

curl--location'https://open-api.123pan.com/api/v1/direct-link/url?fileID=10861131' \

--header'Content-Type: application/json' \

--header'Platform: open\_platform' \

--header'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJl...(过长省略)' \

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

{

"code": 0,

"message": "ok",

"data": {

"url": "https://vip.123pan.cn/1815309870/%E6%B5%8B%E8%AF%95%E7%9B%B4%E9%93%BE%E6%96%87%E4%BB%B6%E5%A4%B9/%E6%88%91%E4%BB%8E%E8%8D%89%E5%8E%9F%E6%9D%A5.mp4"

},

"x-traceID": "126fa997-fdae-4cd6-b79f-42e134e17f1d\_kong-db-5898fdd8c6-t5pvc"

}

​

If you get gains，please give a like

[123云盘](https://123yunpan.yuque.com/123yunpan)

2025-03-17 07:16

4480

IP region浙江

Report

290Word

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/tdxfsmtemp4gu4o2?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/tdxfsmtemp4gu4o2#tUdRq)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/tdxfsmtemp4gu4o2#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/tdxfsmtemp4gu4o2#KkSEp)

[示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/tdxfsmtemp4gu4o2#Yv32T)