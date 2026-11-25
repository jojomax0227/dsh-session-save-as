/**
 * Offline checks for the browser half: module wrapper, locale dictionaries,
 * menu contribution shape, icon registrations, download trigger, and toasts.
 *
 * Run with any Node >= 22:
 *   node test/client.test.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// The bundle is a plain script that registers itself on the page's module loader.
let loaded
globalThis.window = { __ModuleLoader__: { load: (definition) => { loaded = definition } } }
await import(pathToFileURL(join(here, '..', 'client.js')).href)
assert.equal(loaded.id, 'dsh-session-save-as', 'module id equals the package name')

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
}
const plugin = loaded.factory((name) => {
  assert.equal(name, 'react')
  return React
})
assert.equal(plugin.name, 'session-save-as')
assert.deepEqual(plugin.inject, ['contextMenus', 'locale', 'slots'])

const dictionaries = {}
const contributions = []
const icons = []
const notices = []
const downloads = []
const listeners = []

/** Minimal translate implementation with `{name}` interpolation. */
function translate(key, params) {
  const template = dictionaries[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? String(params[name]) : match))
}

const ctx = {
  effect(run) {
    const disposer = run()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  on() {},
  locale: {
    register(namespace, dicts) {
      assert.equal(namespace, 'session-save-as')
      Object.assign(dictionaries, dicts.zh)
      return () => {}
    },
    bind(namespace) {
      assert.equal(namespace, 'session-save-as')
      return translate
    },
  },
  slots: {
    inject(name, callback) {
      assert.equal(name, 'contextMenu.icon')
      const generated = callback()
      for (const disposer of generated) assert.equal(typeof disposer, 'function')
    },
    register(definition, component) {
      icons.push({ ...definition, component })
      return () => {}
    },
  },
  contextMenus: {
    register(contribution) {
      contributions.push(contribution)
      return () => {}
    },
    notify(text, success) {
      notices.push({ text, success })
    },
  },
}
plugin.apply(ctx)

assert.equal(contributions.length, 1, 'one menu contribution is registered')
const contribution = contributions[0]
assert.equal(contribution.target, 'sessionHeader')
assert.equal(contribution.order, 120)
assert.deepEqual(icons.map((icon) => icon.key), [
  'session-save-as.save',
  'session-save-as.pdf',
  'session-save-as.docx',
])

// Icons must render without throwing (they become slot entries).
for (const icon of icons) {
  const element = icon.component()
  assert.equal(element.type, 'svg')
  assert.ok(element.children.length >= 3, `${icon.key} draws paths`)
}

const actions = await contribution.resolve({ sessionId: 'sess-123' }, new AbortController().signal)
assert.equal(actions.length, 1)
assert.equal(actions[0].label, '另存为')
assert.equal(actions[0].id, 'save-as')
assert.deepEqual(actions[0].children.map((child) => child.id), ['pdf', 'docx'])
assert.equal(actions[0].children[0].label, 'PDF 文档（.pdf）')
assert.equal(actions[0].children[1].label, 'Word 文档（.docx）')

// The English dictionary follows the active locale through the bound translate.
dictionaries['menu.saveAs'] = 'Save as'
const english = await contribution.resolve({ sessionId: 'sess-123' }, new AbortController().signal)
assert.equal(english[0].label, 'Save as')
dictionaries['menu.saveAs'] = '另存为'

// Stub the browser surface the download path touches.
const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02])
const requested = []
globalThis.fetch = async (url, init) => {
  requested.push({ url, init })
  const format = new URL(url, 'http://127.0.0.1/').searchParams.get('format')
  if (format === 'pdf' && globalThis.__pdfFails === true) {
    return new Response(JSON.stringify({ code: 'pdf-unavailable', message: 'no office kit' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response(docxBytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="fallback.${format}"; filename*=UTF-8''${encodeURIComponent('重构插件架构-20261125-2130.' + format)}`,
    },
  })
}
const created = []
globalThis.document = {
  body: { appendChild() {} },
  createElement(tag) {
    const element = {
      tag,
      click() {
        created.push({ tag, href: element.href, download: element.download })
      },
      remove() {},
    }
    return element
  },
}
const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL
const objectUrls = []
URL.createObjectURL = (blob) => {
  const url = `blob:${objectUrls.length}`
  objectUrls.push({ url, size: blob.size })
  return url
}
URL.revokeObjectURL = () => {}
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = () => 0
try {
  await actions[0].children[1].run()
  assert.equal(requested.length, 1)
  assert.match(requested[0].url, /^api\/session\.saveas\?sessionId=sess-123&format=docx&lang=/u)
  assert.equal(requested[0].init.credentials, 'same-origin')
  assert.equal(created.length, 1)
  assert.equal(created[0].tag, 'a')
  assert.equal(created[0].download, '重构插件架构-20261125-2130.docx')
  assert.equal(objectUrls.length, 1)
  assert.equal(objectUrls[0].size, docxBytes.byteLength)
  assert.deepEqual(notices.map((notice) => notice.text), [
    '正在生成 Word 文档，请稍候…',
    '已生成 重构插件架构-20261125-2130.docx',
  ])
  assert.equal(notices[1].success, true)

  notices.length = 0
  await actions[0].children[0].run()
  assert.equal(requested[1].url.includes('format=pdf'), true)
  assert.equal(created[1].download, '重构插件架构-20261125-2130.pdf')
  assert.equal(notices[1].success, true)

  globalThis.__pdfFails = true
  notices.length = 0
  await actions[0].children[0].run()
  assert.deepEqual(notices.map((notice) => notice.text), [
    '正在生成 PDF 文档，请稍候…',
    '当前环境未启用 Office 文档转换，无法生成 PDF；请改用 Word 格式保存。',
  ])
} finally {
  globalThis.setTimeout = realSetTimeout
  URL.createObjectURL = realCreate
  URL.revokeObjectURL = realRevoke
}

console.log('client checks passed')
