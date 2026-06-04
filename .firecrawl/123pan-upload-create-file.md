创建文件

MD

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Flrfuu3qe7q1ul8ig)

# 创建文件

Back to document

API： POST 域名 + /upload/v1/file/create

说明：

●文件名要小于256个字符且不能包含以下任何字符："\\/:\*?\|><

●文件名不能全部是空格

●开发者上传单文件大小限制10GB

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
| parentFileID | number | 必填 | 父目录id，上传到根目录时填写 0 |
| filename | string | 必填 | 文件名要小于255个字符且不能包含以下任何字符："\\/:\*?\|><。（注：不能重名）<br>containDir 为 true 时，传入路径+文件名，例如：/你好/123/测试文件.mp4 |
| etag | string | 必填 | 文件md5 |
| size | number | 必填 | 文件大小，单位为 byte 字节 |
| duplicate | number | 非必填 | 当有相同文件名时，文件处理策略（1保留两者，新文件名将自动添加后缀，2覆盖原文件） |
| containDir | bool | 非必填 | 上传文件是否包含路径，默认false |

返回数据

|     |     |     |     |
| --- | --- | --- | --- |
| 名称 | 类型 | 是否必填 | 说明 |
| fileID | number | 非必填 | 文件ID。当123云盘已有该文件,则会发生秒传。此时会将文件ID字段返回。唯一 |
| preuploadID | string | 必填 | 预上传ID(如果 reuse 为 true 时,该字段不存在) |
| reuse | boolean | 必填 | 是否秒传，返回true时表示文件已上传成功 |
| sliceSize | number | 必填 | 分片大小，必须按此大小生成文件分片再上传 |

示例

请求示例

​

Curl

99

1

2

3

4

5

6

7

8

9

10

curl--location'https://open-api.123pan.com/upload/v1/file/create' \

--header'Content-Type: application/json' \

--header'Platform: open\_platform' \

--header'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJl...(过长省略)' \

--data'{

"parentFileID": 0,

"filename": "测试文件.mp4",

"etag": "4b5c549c4abd0a079caf92d6cad24127",

"size": 50650928

}'

响应示例

​

1 like

- ![恶魔程](https://mdn.alipayobjects.com/huamei_0prmtq/afts/img/A*khrYRYi6VN0AAAAAAAAAAAAADvuFAQ/original)

1

[123云盘](https://123yunpan.yuque.com/123yunpan)

2025-06-17 05:18

1936

IP region陕西

Report

680Word

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/lrfuu3qe7q1ul8ig?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[Header 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/lrfuu3qe7q1ul8ig#Nc8be)

[Body 参数](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/lrfuu3qe7q1ul8ig#jf5bZ)

[返回数据](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/lrfuu3qe7q1ul8ig#KkSEp)

[示例](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/lrfuu3qe7q1ul8ig#jJKjt)