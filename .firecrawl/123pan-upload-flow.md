💡上传流程说明

[Try it free](https://123yunpan.yuque.com/login?goto=https%3A%2F%2F123yunpan.yuque.com%2Forg-wiki-123yunpan-muaork%2Fcr6ced%2Fil16qi0opiel4889)

# 💡上传流程说明

Back to document

1创建文件

a请求创建文件接口，接口返回的reuse为true时，表示秒传成功，上传结束。

b非秒传情况将会返回预上传IDpreuploadID与分片大小sliceSize，请将文件根据分片大小切分。

2获取上传地址

a非秒传时，携带返回的preuploadID，自定义分片序号sliceNo(从数字1开始)。

b获取上传地址presignedURL。

3上传文件

a向返回的地址presignedURL发送PUT请求，上传文件分片。

b注：PUT请求的header中请不要携带Authorization、Platform参数。

4文件比对（非必需）

a所有分片上传后，调用列举已上传分片接口，将本地与云端的分片MD5比对。

b注：如果您的文件小于sliceSize ，该操作将会返回空值，可以跳过此步。

5上传完成

a请求上传完毕接口，若接口返回的async为false且fileID不为0时，上传完成。

b若接口返回的async为true时，则需下一步，调用异步轮询获取上传结果接口，获取上传最终结果。

6轮询查询

a若异步轮询获取上传结果接口返回的completed为false，请1秒后再次调用此接口，查询上传结果。

b注：该步骤需要等待，建议轮询获取结果。123云盘服务器会校验用户预上传时的MD5与实际上传成功的MD5是否一致。

上传文件时序图

上传文件Demo

PHP：

index.php(4 kB)

​

[About](https://123yunpan.yuque.com/help/about) [Security](https://123yunpan.yuque.com/about/security) [中文](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/il16qi0opiel4889?language=zh-cn) [Sign up](https://123yunpan.yuque.com/login)

[![](https://cdn.nlark.com/yuque/0/2023/png/39215739/1697095421529-avatar/0305d093-2687-4529-834f-505f11f1ac50.png?x-oss-process=image%2Fresize%2Cm_fill%2Cw_32%2Ch_32%2Fformat%2Cpng)](https://123yunpan.yuque.com/dashboard)

123云盘开放平台

Search⌘ \+ J

Overview

ToC

Outline

[上传文件时序图](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/il16qi0opiel4889#VHFyD)

[上传文件Demo](https://123yunpan.yuque.com/org-wiki-123yunpan-muaork/cr6ced/il16qi0opiel4889#TMDkQ)