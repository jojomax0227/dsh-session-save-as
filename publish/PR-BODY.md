- [x] I added **one file** at `data/plugins/jojomax0227__dsh-session-save-as.yml` — that single file is the whole submission.
- [x] My repo's `package.json` declares **`dsh.bundle`** (`dsh.bundle.patch: ./cordis.patch.yml`, plus `dsh.client` for the browser half).
- [ ] My repo is at least **1 day old** — created `2026-11-25T13:29:20Z`. Until it clears, CI re-runs by itself; no resubmission needed.
- [x] `category: ui` — it adds an entry to the conversation header menu and exports a document from the Web UI.
- [x] Description states what the plugin does, no superlatives.
- [x] My repo has the `dsh-plugin` topic.

`dsh-session-save-as` adds **另存为 / Save as** to the conversation header's
more-actions menu (the `⋯` button) with **PDF document (.pdf)** and
**Word document (.docx)** children.

The Host half registers one authenticated route, `GET /api/session.saveas`,
which reads the committed session events through `session-query`, renders them
as a WordprocessingML package with a dependency-free ZIP writer, and streams the
document back with a `Content-Disposition` filename. For `format=pdf` the same
Word bytes go through the profile's mounted `office-kit` (LibreOffice engine);
when that row is absent the route answers `503 pdf-unavailable` and the menu
tells the user to save as Word instead. The browser half contributes the menu
entry, two child actions and inline SVG icons, then saves the response through
the browser download manager with toasts for progress, success and failure.

Document content: session title, session ID and export time, then every user
message and every visible assistant reply in order, keeping headings, lists,
quotes, inline code, fenced code blocks and tables. Reasoning blocks, tool
calls and results, injected context, and image/file bytes are not exported.
Only the selected session is exported, not its sub-sessions.

Verified locally: offline tests cover the document model, the `.docx` package
(python-docx), all route status paths, the browser menu/download/toast flow, and
a real LibreOffice conversion of the generated document (1 page, no missing
fonts). The bundle is installed and active in a Desktop profile
(`fiberPhase: active`); the rendered menu was not visually verified.
