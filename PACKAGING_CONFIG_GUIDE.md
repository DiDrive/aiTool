# 唯变AI工作台配置与打包说明

本文档用于把当前应用打包后分发到其他 Windows 电脑，并说明首次使用需要配置哪些内容。

## 1. 分发前结论

当前应用可以打包成 Windows 安装包，安装后不需要对方安装 Node.js、npm、Vite 等开发环境。

但 AI 生成能力不是完全免配置的。另一台电脑首次使用时，仍需要配置自己的平台密钥和中转参数。

不建议把 API Key、Client Secret、URL 鉴权密钥直接写进安装包。这样会导致你的额度、云盘权限被别人共用，安装包被拷贝后也无法控制。

## 2. 首次使用需要配置的内容

打开应用后进入“模型 / 平台设置”，至少配置以下内容。

### ExchangeToken

- API Key：ExchangeToken 控制台创建的密钥。
- 代理地址：一般留空；如电脑必须走代理，可填 `http://127.0.0.1:7890`，或按实际代理端口填写。
- 支持能力：勾选需要启用的模型能力，例如 `Seedance 2.0`、`GPT Image 2`。
- 默认平台：需要时设为默认，方便工具页自动选中。

### 123 云盘中转

- 开关：启用。
- Client ID：123 云盘开放平台开发者权益包提供。
- Client Secret：123 云盘开放平台开发者权益包提供。
- Folder ID：用于上传中转素材的文件夹 ID。
- URL 鉴权密钥：123 云盘直链流量包里配置的 URL 鉴权私钥。
- ExchangeToken 资产入库：真人图片/视频用于 Seedance 时建议启用。

### Seedance 使用逻辑

- 用户上传本地图片/视频/音频。
- 应用先把文件上传到 123 云盘指定文件夹。
- 应用生成 123 云盘直链 URL。
- 真人素材会先走 ExchangeToken 资产入库。
- 最后把素材引用交给 Seedance 生成视频。

用户不需要自己手动填写公网 URL。

### GPT Image 2 使用逻辑

- 文生图调用 `/v1/images/generations`。
- 图片编辑调用 `/v1/images/edits`。
- 如果接口返回 base64 图片，应用会先保存成本地图片文件，再写入任务结果。

## 3. 打包前准备

在项目根目录执行：

```powershell
npm install
```

如果 `better-sqlite3` 相关 native 模块报错，可执行：

```powershell
npm.cmd run re-sqlite
```

## 4. 生成 Windows 安装包

执行：

```powershell
npm.cmd run build:win
```

构建产物会输出到：

```text
dist-release
```

当前配置会生成 NSIS 安装包，文件名类似：

```text
唯变AI工作台-1.4.0-win-setup-x64.exe
```

把这个安装包发给其他 Windows 电脑即可。

`build:win` 默认只构建 x64 版本，适合绝大多数 Windows 电脑。

如果确实要同时构建 x64 和 arm64，可执行：

```powershell
npm.cmd run build:win:all
```

但 arm64 构建需要本机安装 Visual Studio v143 ARM64 C++ 生成工具，否则 native 依赖会编译失败。

## 5. 免安装版是什么意思

免安装版通常是一个可以直接双击运行的 `.exe`，不走安装向导，不写开始菜单快捷方式，适合临时测试或放在 U 盘里运行。

但需要注意：

- 免安装不等于免配置。
- 用户仍然要配置 API Key、123 云盘参数。
- Electron 的便携版默认仍可能把用户数据写到系统用户目录，例如 `%APPDATA%`，除非应用代码专门改成“数据跟随 exe 目录”。
- 免安装版更适合测试分发；正式给普通用户使用，安装包更稳。

当前 `electron-builder.json5` 已经有 `portable` 的命名配置，但 Windows 打包目标默认只启用了 `nsis`。

如需临时打一个 x64 免安装版，可执行：

```powershell
npm.cmd run build:win:portable
```

如果希望每次 `npm.cmd run build:win` 都同时生成安装包和免安装版，需要把 `electron-builder.json5` 的 `win.target` 加上 `portable`。

## 6. 推荐交付方式

推荐正式交付：

```text
Windows 安装包 + 配置说明文档
```

推荐测试交付：

```text
Windows 免安装版 + 配置说明文档
```

## 7. 分发前检查清单

- 本机执行 `npm.cmd run build:win` 成功。
- 在一台干净 Windows 电脑安装并打开应用。
- 配置 ExchangeToken API Key。
- 配置 123 云盘中转参数。
- Seedance 上传图片生成视频成功。
- Seedance 上传真人图片时资产入库成功。
- GPT Image 2 文生图成功。
- 任务结果侧边栏能正常展示结果和用时。
- 退出应用后重新打开，配置仍然存在。

## 8. 不建议内置的内容

以下内容不要硬编码进安装包：

- ExchangeToken API Key
- 123 云盘 Client Secret
- 123 云盘 URL 鉴权密钥
- 个人云盘目录或个人账号信息

如果后续确实要做“开箱即用”，建议做成服务端托管密钥，客户端只登录账号，不直接暴露真实密钥。
