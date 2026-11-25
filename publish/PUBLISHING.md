# 发布到插件市场

目标仓库：`github.com/jojomax0227/dsh-session-save-as`（包名 `dsh-session-save-as`，版本 `0.1.0`）。

本目录已按发布要求改好：

| 文件 | 用途 |
|---|---|
| `package.json` | 去掉 `private`；加 `engines.dsh`、`repository`、`homepage`、`bugs`、`author`、`publishConfig`、`LICENSE` 到 `files` |
| `LICENSE` | MIT，版权人 jojomax0227 |
| `.gitignore` | 忽略 `node_modules/`、`out/`、`*.tgz` |
| `.github/workflows/release.yml` | 推 `v*` 标签时自动打包并挂到 Release，资产名固定为 `dsh-session-save-as.tgz` |
| `.github/workflows/check.yml` | 每次 push / PR 跑两个离线测试 |
| `publish/awesome-entry.yml` | 要加进 awesome-dsh-plugin 的那一个文件 |
| `publish/PR-BODY.md` | PR 描述，按仓库模板逐项打勾 |
| `publish/index.json` + `publish/icons/` | 可选：自建 DSH「发现」索引 |

> 本机已经用 `link:` 把该目录装进 `desktop` profile，这是开发形态；下面的发布流程不会影响它。

---

## 1. 建仓库并推送

```powershell
cd D:\Myself\DSHpr\dsh-session-save-as
git init
git add .
git commit -m "feat: save session as PDF or Word"
git branch -M main
git remote add origin https://github.com/jojomax0227/dsh-session-save-as.git
git push -u origin main
```

仓库名必须是 `dsh-session-save-as`：`publish/awesome-entry.yml`、workflows 和包名都按它写。

推送后到仓库 **About** 里加上：

- description：`Save a DSH session as PDF or Word from the conversation header menu.`
- topics：`dsh-plugin`、`dsh`、`deepseek-harness`（**`dsh-plugin` 是市场的硬性检查项**）

---

## 2. 发一个 Release（市场从这里安装）

推标签即可，workflow 会打包并挂资产（`dsh-session-save-as.tgz`）：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

不想用 CI，也可以本地打包后手动上传：

```powershell
cd D:\Myself\DSHpr\dsh-session-save-as
$node = "C:\Users\Admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\Admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
& $node $pnpm pack --pack-destination publish
Rename-Item publish\dsh-session-save-as-0.1.0.tgz dsh-session-save-as.tgz
```

然后在 GitHub 上 **Releases → Draft a new release**，标签填 `v0.1.0`，把 `publish\dsh-session-save-as.tgz`
作为附件上传。市场安装的地址是：

```
https://github.com/jojomax0227/dsh-session-save-as/releases/latest/download/dsh-session-save-as.tgz
```

> 资产名固定为 `dsh-session-save-as.tgz`（不带版本号），以后每次发版只换内容、不改条目里的 URL。

---

## 3. 向 awesome-dsh-plugin 提 PR

市场（`dshmarket`）的插件列表来自精选列表，**只提交一个文件**：

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>。
2. 新增 `data/plugins/jojomax0227__dsh-session-save-as.yml`，内容就是
   [`publish/awesome-entry.yml`](./awesome-entry.yml)。
3. PR 描述照抄 [`publish/PR-BODY.md`](./PR-BODY.md)，把其中
   `<YYYY-MM-DDTHH:mm:ssZ>` 换成仓库的创建时间。
4. 提 PR，等 CI。

CI 的硬门槛（来自仓库的 `pr-body.md` 与 `contributing.md`）：

- 一个文件就是全部提交内容；
- `package.json` 声明 `dsh.bundle`（有 `dsh.client` 更好）；
- 仓库创建**满 1 天**（不满只挂这一项，CI 会自动复跑，无需重提）；
- `category` 用列表既有分类（这里用 `ui`）；
- 描述陈述事实，不用“最强/最好”一类词；
- 仓库带 `dsh-plugin` topic。

合并后站点与市场**通常一天内**自动收录；收录后也能被 DSH 自带的
**插件 → 发现** 搜索到（该精选目录同时发布为
`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`）。

---

## 4. 可选：发布到 npm（更新更顺）

走 npm 后，市场能按版本号检测更新；只发 GitHub Release 时更新依赖重装。

```powershell
$node = "C:\Users\Admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\Admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
cd D:\Myself\DSHpr\dsh-session-save-as
& $node $pnpm publish --access public --no-git-checks
```

前提：有 npm 账号且已登录（`pnpm login`，或设置 `NPM_TOKEN`）。
名字 `dsh-session-save-as` 在 npm 目前未被占用；若以后被占，改成 `@jojomax0227/dsh-session-save-as`
并同步改 `publish/awesome-entry.yml`、`publish/index.json` 与包内引用。

发到 npm 后，`publish/awesome-entry.yml` 里的 `tarball:` 可以删掉，索引里
`"source": { "type": "npm" }` 会直接生效。

---

## 5. 可选：自建 DSH「发现」索引

不想等社区收录，可以自己托管一份 format 1 索引：

1. 把 `publish/index.json` 与 `publish/icons/` 一起放到静态主机（例如仓库的 `gh-pages`
   分支或 `docs/` 目录经 GitHub Pages 发布）。
2. 得到形如 `https://jojomax0227.github.io/dsh-session-save-as/index.json` 的地址
   （必须 **https**、2xx、不重定向）。
3. 用户在 **插件 → 发现 → Add index source** 添加该地址即可浏览安装。

改版本时同步改 `versions[]` 里的 `version` 与 `publishTimestamp`（Unix 秒）。

---

## 6. 以后的发版流程

```powershell
# 1) 改 package.json 的 version，例如 0.1.1
# 2) 提交并推标签
git add -A; git commit -m "chore: release v0.1.1"; git push
git tag v0.1.1; git push origin v0.1.1
# 3) 若走 npm：& $node $pnpm publish --access public --no-git-checks
```

市场侧：npm 来源跟随版本号；tarball 来源需要用户重装或市场按版本提示更新。

---

## 7. 本地自检（发布前跑一遍）

```powershell
$node = "C:\Users\Admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd D:\Myself\DSHpr\dsh-session-save-as

& $node test/host.test.mjs      # 文档模型 / docx / 路由
& $node test/client.test.mjs    # 菜单 / 下载 / 提示
& $node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
& $node -e "JSON.parse(require('fs').readFileSync('publish/index.json','utf8')); console.log('index.json ok')"
```

`publish/index.json` 还可以用 DSH 自带的校验器验证（`parseMarketIndex`）：
见本目录 `publish/verify.mjs`，用法写在文件头。

用打出来的 tarball 验证一次“像市场那样安装”：

```powershell
dsh plugin --profile test-save-as add D:\Myself\DSHpr\dsh-session-save-as\publish\dsh-session-save-as.tgz
```

（需要 `dsh` CLI；没有的话，插件的本地验证已经通过 `link:` 安装完成。）

---

## 8. 常见驳回原因

- 仓库没有 `dsh-plugin` topic；
- `package.json` 还留着 `"private": true`（市场生成器会跳过）；
- 没有 `dsh.bundle`，或 patch 文件路径写错；
- 仓库创建不满 1 天；
- 用了列表里不存在的 `category`；
- 描述里带夸张词，或只写“更好的 DSH 插件”这类空话；
- PR 里改了别的文件（比如顺手改了别人的条目）。
