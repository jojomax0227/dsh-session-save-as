# 会话另存为（dsh-session-save-as）

在 DeepSeek Harness 的会话标题栏“更多操作”（⋯）菜单中增加 **另存为**，把当前会话的对话内容保存为 PDF 或 Word 文档。

## 使用

1. 打开要导出的会话。
2. 点击标题栏右侧的 ⋯（更多操作）。
3. 选择 **另存为** → **PDF 文档（.pdf）** 或 **Word 文档（.docx）**。
4. 浏览器按自身下载设置保存文件；文件名取自会话标题并附带导出时间，
   例如 `重构插件架构-20261125-2130.docx`。

生成期间、成功与失败都有提示气泡；PDF 不可用时会说明原因。


## 格式与依赖

两种格式共用同一份 Word 版式：`format=pdf` 时 Host 先生成 `.docx` 字节，再交给
当前 profile 挂载的 Office 转换服务（`office-kit`，LibreOffice 引擎）转成 PDF。

- 未挂载 `office-kit` 或引擎不可用时，PDF 导出返回 `pdf-unavailable`，
  菜单提示改用 Word；Word 导出不受影响。
- 首次 PDF 转换需要启动 LibreOffice 引擎，可能等待数秒。


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


