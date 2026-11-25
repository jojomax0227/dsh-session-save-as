# 会话另存为（dsh-session-save-as）

在 DeepSeek Harness 的会话标题栏“更多操作”（⋯）菜单中增加 **另存为**，把当前会话的对话内容保存为 PDF 或 Word 文档。

## 使用

1. 打开要导出的会话。
2. 点击标题栏右侧的 ⋯（更多操作）。
3. 选择 **另存为** → **PDF 文档（.pdf）** 或 **Word 文档（.docx）**。
4. 浏览器按自身下载设置保存文件；文件名取自会话标题并附带导出时间，
   例如 `重构插件架构-20261125-2130.docx`。

生成期间、成功与失败都有提示气泡；PDF 不可用时会说明原因。

## 文档内容

- 标题：会话最新标题；没有标题时用“未命名会话 / Untitled session”。
- 副标题：会话 ID 与导出时间。
- 正文：按时间顺序包含用户消息和助手的全部可见回复，保留标题层级、列表、
  引用、行内代码、围栏代码块；表格按等宽文本输出。
- 不包含：推理过程、工具调用与工具结果、系统/开发者消息、注入的上下文、
  请求头，以及图片与附件的二进制内容（只保留 `[Image: …]`、`[File: …]` 标签）。
- 只导出当前会话，不包含子会话。

## 格式与依赖

两种格式共用同一份 Word 版式：`format=pdf` 时 Host 先生成 `.docx` 字节，再交给
当前 profile 挂载的 Office 转换服务（`office-kit`，LibreOffice 引擎）转成 PDF。

- 未挂载 `office-kit` 或引擎不可用时，PDF 导出返回 `pdf-unavailable`，
  菜单提示改用 Word；Word 导出不受影响。
- 首次 PDF 转换需要启动 LibreOffice 引擎，可能等待数秒。

## 安装

已作为本地目录 bundle 安装到 `desktop` profile（`link:` 依赖）。也可手动安装：

```sh
dsh plugin --profile <profile> add link:D:\Myself\DSHpr\dsh-session-save-as
```

发布形态（GitHub Release tarball 或 npm）安装：

```sh
dsh plugin --profile <profile> add ./dsh-session-save-as.tgz
dsh plugin --profile <profile> add dsh-session-save-as
```

安装后刷新页面一次，浏览器端才会加载新的菜单项。

## 发布到插件市场

完整步骤见 [publish/PUBLISHING.md](publish/PUBLISHING.md)：已按 `github.com/jojomax0227/dsh-session-save-as`
准备好可发布的 `package.json`、`LICENSE`、awesome-dsh-plugin 条目、PR 文案、Release workflow
与自建索引文件。发布前自检：

```sh
node test/host.test.mjs
node test/client.test.mjs
# 用 DSH 安装里自带的校验器验证条目与索引格式
# $env:ELECTRON_RUN_AS_NODE = "1"
# & "D:\Program Files\DeepSeek Harness\DeepSeek Harness.exe" publish/verify.mjs
```

## 结构

| 路径 | 作用 |
|---|---|
| `index.js` | Host 插件：注册 `GET /api/session.saveas`。 |
| `lib/document.js` | 会话事件 → 文档模型（标题、发言人、Markdown 块）。 |
| `lib/docx.js` | 文档模型 → WordprocessingML 部件。 |
| `lib/zip.js` | 无第三方依赖的 ZIP 写入器，用于打包 `.docx`。 |
| `client.js` | 浏览器模块：菜单项、图标、下载与提示。 |
| `cordis.patch.yml` | 插入 Host 行。 |
| `publish/` | 发布材料：awesome 条目、PR 文案、自建索引、校验脚本、发布指南。 |
| `.github/workflows/` | `release.yml` 打包并挂 Release；`check.yml` 跑离线测试。 |
| `test/` | 离线校验脚本（不随包发布）。 |

## 路由

```text
GET /api/session.saveas?sessionId=<id>&format=docx|pdf&lang=zh|en
```

- `200` — 文档字节，带 `Content-Disposition`。
- `400` — `bad-request`
- `404` — `missing-session`
- `500` — `missing-service`（缺少 `session-query`）或 `read-failed`
- `503` — `pdf-unavailable`（缺少 Office 转换）或 `pdf-failed`

失败时返回 JSON `{ "code": …, "message": … }`。

## 校验

```sh
node test/host.test.mjs     # 文档模型、docx 包、路由行为
node test/client.test.mjs   # 浏览器端菜单、下载、提示
```

`test/convert_pdf.mjs`、`test/render_pdf.mjs` 用运行中的 Desktop 安装真实调用
LibreOffice 引擎，验证 Word → PDF 与页面渲染；需以 `ELECTRON_RUN_AS_NODE=1`
运行 Desktop 的 Electron 二进制。
