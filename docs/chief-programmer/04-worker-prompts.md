# Worker 提示词

本次没有启用 worker/subagent；实现与审查由当前任务顺序完成。

后续如并行制作运行包，可使用：

> 基于 tigerowo/infinite-canvas 的固定 commit 构建 Windows x64 sidecar。只修改监听
> 地址以支持 BIND_ADDRESS，输出 server.exe、Next standalone、LICENSE、完整对应源码、
> MODIFICATIONS.md 和 sidecar.json。不得提交密钥、数据库或 node_modules 缓存；报告
> commit、构建命令、产物哈希和健康检查结果。
