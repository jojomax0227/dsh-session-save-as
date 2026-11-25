/**
 * Turn a committed Session event snapshot into a flat document model.
 *
 * The model is deliberately renderer agnostic: {@link module:./docx} turns it
 * into WordprocessingML and the Host route may hand the same Word file to the
 * Office converter for PDF output. Only human user messages, final assistant
 * replies, and attachment labels become content; reasoning blocks, injected
 * context, request headers, and tool activity are not part of the document.
 */

const DEFAULT_TITLE_ZH = '未命名会话'
const DEFAULT_TITLE_EN = 'Untitled session'
const MAX_TITLE_LENGTH = 120

const LABELS = {
  zh: { user: '你', assistant: '助手', sessionId: '会话 ID', exported: '导出时间', title: DEFAULT_TITLE_ZH },
  en: { user: 'You', assistant: 'Assistant', sessionId: 'Session ID', exported: 'Exported', title: DEFAULT_TITLE_EN },
}

/**
 * Normalize one line of Markdown inline content into styled runs.
 * @param {string} text - one line or a small block of inline Markdown.
 * @param {{ bold?: boolean, italic?: boolean }} [style] - inherited emphasis.
 * @returns {ReadonlyArray<{ text: string, bold?: boolean, italic?: boolean, code?: boolean }>} runs.
 */
function inlineRuns(text, style = {}) {
  const runs = []
  const source = String(text)
  let index = 0
  const push = (value, extra = {}) => {
    if (value === '') return
    const bold = extra.bold ?? style.bold
    const italic = extra.italic ?? style.italic
    const code = extra.code ?? style.code
    const last = runs[runs.length - 1]
    if (last !== undefined
      && Boolean(last.bold) === Boolean(bold)
      && Boolean(last.italic) === Boolean(italic)
      && Boolean(last.code) === Boolean(code)) {
      last.text += value
      return
    }
    runs.push({
      text: value,
      ...(bold === true ? { bold: true } : {}),
      ...(italic === true ? { italic: true } : {}),
      ...(code === true ? { code: true } : {}),
    })
  }
  while (index < source.length) {
    const rest = source.slice(index)
    const escape = /^\\([\\`*_{}[\]()#+\-.!>])/.exec(rest)
    if (escape !== null) {
      push(escape[1], {})
      index += escape[0].length
      continue
    }
    const code = /^(`+)([\s\S]*?)\1/.exec(rest)
    if (code !== null) {
      push(code[2], { code: true })
      index += code[0].length
      continue
    }
    const bold = /^\*\*([\s\S]+?)\*\*/.exec(rest)
    if (bold !== null) {
      for (const run of inlineRuns(bold[1], { ...style, bold: true })) push(run.text, run)
      index += bold[0].length
      continue
    }
    const italic = /^\*([^*\n]+)\*/.exec(rest)
    if (italic !== null) {
      for (const run of inlineRuns(italic[1], { ...style, italic: true })) push(run.text, run)
      index += italic[0].length
      continue
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/.exec(rest)
    if (image !== null) {
      push(image[1] === '' ? 'image' : image[1], { italic: true })
      index += image[0].length
      continue
    }
    const link = /^\[([^\]]*)\]\(([^)\s]*)[^)]*\)/.exec(rest)
    if (link !== null) {
      push(link[1], {})
      if (link[2] !== '' && link[2] !== link[1]) push(` (${link[2]})`, { italic: true })
      index += link[0].length
      continue
    }
    const next = /[\\`*_[\]!]/.exec(source.slice(index + 1))
    const end = next === null ? source.length : index + 1 + next.index
    push(source.slice(index, end), {})
    index = end
  }
  return runs
}

/**
 * Convert one Markdown-ish text block into document blocks.
 * @param {string} markdown - assistant or user message text.
 * @returns {Array<Record<string, unknown>>} document blocks.
 */
function markdownBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n?/gu, '\n').split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence !== null) {
      const marker = fence[1][0]
      const length = fence[1].length
      const code = []
      index += 1
      const closing = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${length},}\\s*$`, 'u')
      while (index < lines.length && !closing.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', lines: code.length === 0 ? [''] : code })
      continue
    }
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, runs: inlineRuns(heading[2]) })
      index += 1
      continue
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }
    const quote = /^ {0,3}>\s?(.*)$/.exec(line)
    if (quote !== null) {
      const parts = []
      while (index < lines.length) {
        const current = /^ {0,3}>\s?(.*)$/.exec(lines[index])
        if (current === null) break
        parts.push(current[1])
        index += 1
      }
      blocks.push({ type: 'quote', runs: inlineRuns(parts.join('\n')) })
      continue
    }
    const bullet = /^( *)[-*+]\s+(.*)$/.exec(line)
    if (bullet !== null) {
      blocks.push({
        type: 'list',
        level: Math.min(2, Math.floor(bullet[1].length / 2)),
        marker: '•',
        runs: inlineRuns(bullet[2]),
      })
      index += 1
      continue
    }
    const ordered = /^( *)(\d{1,9})[.)]\s+(.*)$/.exec(line)
    if (ordered !== null) {
      blocks.push({
        type: 'list',
        level: Math.min(2, Math.floor(ordered[1].length / 2)),
        marker: `${ordered[2]}.`,
        runs: inlineRuns(ordered[3]),
      })
      index += 1
      continue
    }
    if (/^ {0,3}\|/.test(line)) {
      const rows = []
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        rows.push(lines[index].trim())
        index += 1
      }
      blocks.push({ type: 'code', lines: rows })
      continue
    }
    const paragraph = []
    while (index < lines.length) {
      const current = lines[index]
      if (current.trim() === '') break
      if (/^ {0,3}(?:#{1,6}\s|`{3,}|~{3,}|>|\|)/.test(current)) break
      if (/^( *)(?:[-*+]\s|\d{1,9}[.)]\s)/.test(current)) break
      if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(current)) break
      paragraph.push(current)
      index += 1
    }
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', runs: inlineRuns(paragraph.join('\n')) })
  }
  return blocks
}

/**
 * Read the visible text of one message content array.
 * @param {ReadonlyArray<Record<string, unknown>>} content - message content blocks.
 * @returns {string} concatenated visible text with attachment labels.
 */
function visibleText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    switch (block?.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text !== '') parts.push(block.text)
        break
      case 'image': {
        const attachment = block.attachment ?? {}
        const name = typeof attachment.name === 'string' && attachment.name !== '' ? attachment.name : 'image'
        parts.push(`[Image: ${name}]`)
        break
      }
      case 'file': {
        const attachment = block.attachment ?? {}
        const name = typeof attachment.name === 'string' && attachment.name !== '' ? attachment.name : 'file'
        parts.push(`[File: ${name}]`)
        break
      }
      default:
        break
    }
  }
  return parts.join('\n\n')
}

/**
 * Collapse a Session title into one safe heading line.
 * @param {string | undefined} title - latest stored title.
 * @param {keyof typeof LABELS} lang - label language.
 * @returns {string} the heading text.
 */
function normalizedTitle(title, lang) {
  const line = typeof title === 'string' ? title.replace(/\r\n?|\n/gu, ' ').trim() : ''
  return line === '' ? LABELS[lang].title : line.slice(0, MAX_TITLE_LENGTH)
}

/**
 * Render one timestamp in the Host's local time zone.
 * @param {Date} date - instant to render.
 * @returns {string} `YYYY-MM-DD HH:mm` text.
 */
function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Build the document model for one Session snapshot.
 * @param {ReadonlyArray<Record<string, any>>} events - committed logical events in seq order.
 * @param {{ sessionId?: string, lang?: keyof typeof LABELS, now?: Date }} [options] - identity, label language, and export instant.
 * @returns {{ title: string, subtitle: string, exportedAt: Date, blocks: ReadonlyArray<Record<string, unknown>> }} document model.
 */
export function sessionToDocument(events, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'zh'
  const labels = LABELS[lang]
  const exportedAt = options.now instanceof Date ? options.now : new Date()
  const list = Array.isArray(events) ? events : []
  const title = normalizedTitle(
    list.findLast((event) => event?.type === 'session/title')?.data?.title,
    lang,
  )
  const sessionId = typeof options.sessionId === 'string' ? options.sessionId : ''
  const subtitle = [
    sessionId === '' ? undefined : `${labels.sessionId}: ${sessionId}`,
    `${labels.exported}: ${formatTimestamp(exportedAt)}`,
  ].filter((part) => part !== undefined).join('  ·  ')

  const blocks = []
  let pending = []
  /** Flush the assistant text collected for the current message. */
  const flushAssistant = () => {
    if (pending.length === 0) return
    blocks.push({ type: 'speaker', role: 'assistant', text: labels.assistant })
    blocks.push(...pending)
    pending = []
  }

  for (const event of list) {
    switch (event?.type) {
      case 'user/message': {
        if ((event.surfaceOp ?? 'append') !== 'append') break
        if (event.data?.source?.kind !== 'user') break
        flushAssistant()
        const text = visibleText(event.data?.content)
        if (text.trim() === '') break
        blocks.push({ type: 'speaker', role: 'user', text: labels.user })
        blocks.push(...markdownBlocks(text))
        break
      }
      case 'assistant/message': {
        if ((event.surfaceOp ?? 'append') !== 'append') break
        const text = visibleText(event.data?.message?.content)
        if (text.trim() === '') break
        pending.push(...markdownBlocks(text))
        break
      }
      default:
        break
    }
  }
  flushAssistant()

  return { title, subtitle, exportedAt, blocks }
}
