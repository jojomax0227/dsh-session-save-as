/**
 * Offline checks for the Host half: document model, DOCX package, and the
 * registered download route exercised through a fake Cordis context.
 *
 * Run with any Node >= 22 (no Harness runtime required):
 *   node test/host.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, SAVE_AS_PATH } from '../index.js'
import { sessionToDocument } from '../lib/document.js'
import { buildDocx } from '../lib/docx.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'out')

const NOW = new Date('2026-11-25T13:30:00+08:00')

/** Synthetic committed Session events with the shapes the Host reads. */
const EVENTS = [
  { type: 'session/title', data: { title: '重构插件架构' } },
  { type: 'turn/start', data: {} },
  {
    type: 'user/message',
    surfaceOp: 'append',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '请把 **会话导出** 做成插件，支持 PDF 与 Word。\n第二行内容。' }],
    },
  },
  {
    type: 'assistant/message',
    surfaceOp: 'append',
    data: {
      message: {
        content: [
          { type: 'text', text: '## 方案\n\n- 使用 `sessionQuery` 读取事件\n- 生成 OOXML 包\n\n```js\nconst a = 1 < 2 && 3 > 2\n```\n\n> 引用说明\n\n---\n\n| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |' },
        ],
      },
    },
  },
  { type: 'tool/call', data: { name: 'read', arguments: '{}', callId: 'c1' } },
  { type: 'tool/result', surfaceOp: 'append', data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'tool output' }] } } },
  {
    type: 'assistant/message',
    surfaceOp: 'append',
    data: { message: { content: [{ type: 'text', text: '完成。' }, { type: 'image', attachment: { name: 'demo.png', width: 10, height: 10, bytes: 1 } }] } },
  },
  { type: 'turn/end', data: {} },
  {
    type: 'user/message',
    surfaceOp: 'append',
    data: { source: { kind: 'inject' }, content: [{ type: 'text', text: '注入的上下文不应出现' }] },
  },
]

const document = sessionToDocument(EVENTS, { sessionId: 'sess-123', lang: 'zh', now: NOW })
assert.equal(document.title, '重构插件架构')
assert.match(document.subtitle, /sess-123/u)
assert.match(document.subtitle, /2026-11-25 13:30/u)
const snapshot = JSON.stringify(document.blocks)
assert.ok(snapshot.includes('请把'), 'user text is exported')
assert.ok(!snapshot.includes('注入的上下文不应出现'), 'injected context is excluded')
assert.ok(!snapshot.includes('tool output'), 'tool results are excluded')
assert.ok(!snapshot.includes('"tool"'), 'tool calls are excluded')
assert.ok(document.blocks.some((block) => block.type === 'heading' && block.level === 2), 'headings are kept')
assert.ok(document.blocks.some((block) => block.type === 'list'), 'lists are kept')
assert.ok(document.blocks.some((block) => block.type === 'code'), 'code fences are kept')
assert.ok(document.blocks.some((block) => block.type === 'quote'), 'quotes are kept')
assert.ok(document.blocks.some((block) => block.type === 'divider'), 'rules are kept')
assert.ok(document.blocks.some((block) => block.type === 'speaker' && block.role === 'user'), 'user speaker is present')
assert.ok(document.blocks.some((block) => block.type === 'speaker' && block.role === 'assistant'), 'assistant speaker is present')
assert.ok(snapshot.includes('[Image: demo.png]'), 'attachment labels are kept')

const english = sessionToDocument(EVENTS, { sessionId: 'sess-123', lang: 'en', now: NOW })
assert.ok(JSON.stringify(english.blocks).includes('"You"'), 'english labels are used')

const docx = buildDocx(document)
assert.equal(docx.subarray(0, 2).toString('latin1'), 'PK', 'docx is a ZIP archive')

// The route is exercised through the same plugin entry the loader uses.
const registrations = []
const ctx = {
  effect(run) { run() },
  logger: { warn() {}, info() {}, debug() {} },
  get(service) {
    if (service === 'connection') {
      return {
        fetch: {
          register(route) {
            registrations.push(route)
            return () => Promise.resolve()
          },
        },
      }
    }
    if (service === 'sessionQuery') {
      return { readSession: (sessionId) => Promise.resolve({ id: sessionId, events: EVENTS }) }
    }
    if (service === 'officeKit') {
      return {
        convert: (request) => Promise.resolve({
          pdf: new TextEncoder().encode(`%PDF-1.4\n% fake ${request.source.version}\n`),
          missingFonts: [],
        }),
      }
    }
    return undefined
  },
}
apply(ctx)
assert.equal(registrations.length, 1, 'one route is registered')
assert.equal(registrations[0].path, SAVE_AS_PATH)
assert.deepEqual(registrations[0].methods, ['GET'])

/** @param {string} query - query string. */
const request = (query) => registrations[0].fetch(new Request(`http://127.0.0.1${SAVE_AS_PATH}?${query}`))

const word = await request('sessionId=sess-123&format=docx&lang=zh')
assert.equal(word.status, 200)
assert.equal(word.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
const disposition = word.headers.get('content-disposition')
assert.match(disposition, /filename\*=UTF-8''/u)
assert.match(decodeURIComponent(disposition.split("UTF-8''")[1]), /重构插件架构-\d{8}-\d{4}\.docx/u)
const wordBytes = new Uint8Array(await word.arrayBuffer())
assert.ok(wordBytes.byteLength > 2000, 'word bytes look like a package')

const pdf = await request('sessionId=sess-123&format=pdf&lang=zh')
assert.equal(pdf.status, 200)
assert.equal(pdf.headers.get('content-type'), 'application/pdf')
const pdfBytes = new Uint8Array(await pdf.arrayBuffer())
assert.equal(new TextDecoder().decode(pdfBytes).slice(0, 5), '%PDF-')

const bad = await request('sessionId=sess-123&format=html')
assert.equal(bad.status, 400)
assert.equal((await bad.json()).code, 'bad-request')

// A profile without office-kit reports pdf-unavailable but keeps Word working.
const noOffice = {
  ...ctx,
  get(service) {
    return service === 'officeKit' ? undefined : ctx.get(service)
  },
}
registrations.length = 0
apply(noOffice)
const unavailable = await registrations[0].fetch(new Request(`http://127.0.0.1${SAVE_AS_PATH}?sessionId=sess-123&format=pdf`))
assert.equal(unavailable.status, 503)
assert.equal((await unavailable.json()).code, 'pdf-unavailable')
const stillWord = await registrations[0].fetch(new Request(`http://127.0.0.1${SAVE_AS_PATH}?sessionId=sess-123&format=docx`))
assert.equal(stillWord.status, 200)

// A missing Session maps to 404 and a hidden service to 500.
const missing = {
  ...ctx,
  get(service) {
    if (service === 'sessionQuery') {
      return {
        readSession: () => {
          const error = new Error('gone')
          error.code = 'SESSION_QUERY_SESSION_NOT_FOUND'
          return Promise.reject(error)
        },
      }
    }
    return ctx.get(service)
  },
}
registrations.length = 0
apply(missing)
const notFound = await registrations[0].fetch(new Request(`http://127.0.0.1${SAVE_AS_PATH}?sessionId=nope&format=docx`))
assert.equal(notFound.status, 404)
assert.equal((await notFound.json()).code, 'missing-session')

const noQuery = {
  ...ctx,
  get(service) {
    return service === 'sessionQuery' ? undefined : ctx.get(service)
  },
}
registrations.length = 0
apply(noQuery)
const noService = await registrations[0].fetch(new Request(`http://127.0.0.1${SAVE_AS_PATH}?sessionId=sess-123&format=docx`))
assert.equal(noService.status, 500)
assert.equal((await noService.json()).code, 'missing-service')

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'session.docx'), docx)
console.log('host checks passed:', outDir)
