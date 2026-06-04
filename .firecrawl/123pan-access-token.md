获取access\_token

MD

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Fgn1nai4x0v0ry9ki)

# 获取access\_token

Back to document

API： POST 域名 +/api/v1/access\_token

注：此接口有访问频率限制。请获取到access\_token后本地保存使用，并在access\_token过期前及时重新获取。access\_token有效期根据返回的expiredAt字段判断。

Header 参数

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| Platform | string | 是 | open\_platform |

Body 参数

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| clientID | string | 必填 |  |
| clientSecret | string | 必填 |  |

返回数据

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| accessToken | string | 必填 | 访问凭证 |
| expiredAt | string | 必填 | access\_token过期时间 |

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

curl--location'https://open-api.123pan.com/api/v1/access\_token' \

--header'Platform: open\_platform' \

--header'Content-Type: application/json' \

--data'{

"clientID": "123456789",

"clientSecret": "123456789"

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

"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyxxxxx...(过长已省略)",

"expiredAt": "2025-03-23T15:48:37+08:00"

},

"x-traceID": "16f60c4d-f022-42d3-b3df-85d1fe2a3ac5\_kong-db-5898fdd8c6-wgsts"

}

​

4 likes

- ![煜哥](https://cdn.nlark.com/yuque/0/2021/png/12421427/1610219285139-avatar/e68ac5c9-9ab0-4730-9bef-eea22c048571.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_64%2Ch_64%2Fformat%2Cpng)
- ![Luoyangan](https://mdn.alipayobjects.com/huamei_0prmtq/afts/img/A*khrYRYi6VN0AAAAAAAAAAAAADvuFAQ/original)
- ![macan](https://mdn.alipayobjects.com/huamei_0prmtq/afts/img/A*khrYRYi6VN0AAAAAAAAAAAAADvuFAQ/original)
- ![NekoGan](https://mdn.alipayobjects.com/huamei_0prmtq/afts/img/A*khrYRYi6VN0AAAAAAAAAAAAADvuFAQ/original)

4

[123云盘](https://123yunpan.yuque.com/123yunpan)

2025-06-16 21:37

15667

IP region浙江

Report

326Word

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/gn1nai4x0v0ry9ki?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/gn1nai4x0v0ry9ki#tUdRq)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/gn1nai4x0v0ry9ki#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/gn1nai4x0v0ry9ki#KkSEp)

[示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/gn1nai4x0v0ry9ki#rmJBD)