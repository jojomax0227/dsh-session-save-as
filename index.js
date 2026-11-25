/**
 * Host half of the "Save session as" bundle.
 *
 * It registers one authenticated download route, `/api/session.saveas`, that
 * renders the committed conversation of one Session as a Word document. When
 * `format=pdf` is requested the same Word bytes are handed to the mounted
 * Office converter, so both formats share one layout.
 */
import { buildDocx } from './lib/docx.js'
import { sessionToDocument } from './lib/document.js'

export const name = 'session-save-as'
export const inject = ['connection']

/** Absolute registration path of the download route. */
export const SAVE_AS_PATH = '/api/session.saveas'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'

/**
 * Build one JSON failure response the browser can localize.
 * @param {number} status - HTTP status code.
 * @param {string} code - stable machine code understood by the browser half.
 * @param {string} message - diagnostic text; never shown verbatim for known codes.
 * @returns {Response} JSON failure response.
 */
function failure(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Render one download filename component from a Session title.
 * @param {string} title - Session heading.
 * @param {string} sessionId - Session identity.
 * @param {Date} exportedAt - export instant.
 * @returns {string} sanitized file name without extension.
 */
function documentFilename(title, sessionId, exportedAt) {
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${exportedAt.getFullYear()}${pad(exportedAt.getMonth() + 1)}${pad(exportedAt.getDate())}`
    + `-${pad(exportedAt.getHours())}${pad(exportedAt.getMinutes())}`
  const safeTitle = String(title)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/gu, '_')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80)
  const fallback = `session-${sessionId.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 8) || 'export'}`
  return `${safeTitle === '' ? fallback : safeTitle}-${stamp}`
}

/**
 * Build the Content-Disposition header with an ASCII fallback and a UTF-8 name.
 * @param {string} filename - user-visible file name, extension included.
 * @param {string} fallback - ASCII-safe file name.
 * @returns {string} header value.
 */
function contentDisposition(filename, fallback) {
  const encoded = encodeURIComponent(filename).replace(/['()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Build one binary download response.
 * @param {Uint8Array} bytes - file content.
 * @param {string} contentType - MIME type.
 * @param {string} filename - user-visible file name.
 * @param {string} fallback - ASCII-safe file name.
 * @returns {Response} downloadable response.
 */
function fileResponse(bytes, contentType, filename, fallback) {
  return new Response(bytes, {
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
      'content-disposition': contentDisposition(filename, fallback),
      'cache-control': 'no-store',
    },
  })
}

/**
 * Identify a Session-query "not found" failure by its stable machine code.
 * @param {unknown} error - rejection from the query service.
 * @returns {boolean} whether the Session is absent.
 */
function isSessionNotFound(error) {
  return error instanceof Error && 'code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND'
}

/**
 * Convert the Word bytes to PDF through the shared Office converter.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 * @param {Uint8Array} docx - Word document bytes.
 * @param {string} owner - Session identity used as the converter output owner.
 * @returns {Promise<Uint8Array>} PDF bytes.
 * @throws when the Office converter is missing or the conversion fails.
 */
async function convertToPdf(ctx, docx, owner) {
  const officeKit = ctx.get('officeKit')
  if (officeKit === undefined || typeof officeKit.convert !== 'function') {
    const unavailable = new Error('The office conversion service is not mounted in this profile.')
    unavailable.code = 'unavailable'
    throw unavailable
  }
  const bytes = new Uint8Array(docx)
  const version = `save-as:${String(bytes.byteLength)}:${String(Date.now())}`
  const result = await officeKit.convert({
    extension: 'docx',
    priority: 'foreground',
    source: {
      key: `session-save-as:${owner}`,
      version,
      bytes: bytes.byteLength,
      read: () => Promise.resolve({ bytes, version }),
    },
  })
  if (!(result?.pdf instanceof Uint8Array) || result.pdf.byteLength === 0) {
    throw new Error('The converter returned no PDF bytes.')
  }
  return result.pdf
}

/**
 * Answer one save-as request.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 * @param {Request} request - authenticated Fetch request.
 * @returns {Promise<Response>} document download, or a JSON failure.
 */
async function handleRequest(ctx, request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId') ?? ''
  const format = (url.searchParams.get('format') ?? 'docx').toLowerCase()
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh'
  if (sessionId === '' || (format !== 'docx' && format !== 'pdf')) {
    return failure(400, 'bad-request', 'A sessionId query parameter and format=docx|pdf are required.')
  }
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined || typeof sessionQuery.readSession !== 'function') {
    return failure(500, 'missing-service', 'Session save as is unavailable: the session-query service is not mounted.')
  }
  let snapshot
  try {
    request.signal.throwIfAborted()
    snapshot = await sessionQuery.readSession(sessionId)
  } catch (error) {
    if (isSessionNotFound(error)) return failure(404, 'missing-session', 'The session was not found.')
    return failure(500, 'read-failed', 'The session log could not be read.')
  }
  request.signal.throwIfAborted()
  const document = sessionToDocument(snapshot?.events ?? [], { sessionId, lang, now: new Date() })
  const docx = buildDocx(document)
  const base = documentFilename(document.title, sessionId, document.exportedAt)
  const asciiBase = `session-${sessionId.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 8) || 'export'}`
  if (format === 'docx') {
    return fileResponse(docx, DOCX_MIME, `${base}.docx`, `${asciiBase}.docx`)
  }
  try {
    const pdf = await convertToPdf(ctx, docx, sessionId)
    return fileResponse(pdf, PDF_MIME, `${base}.pdf`, `${asciiBase}.pdf`)
  } catch (error) {
    const unavailable = error instanceof Error && 'code' in error && error.code === 'unavailable'
    return failure(
      503,
      unavailable ? 'pdf-unavailable' : 'pdf-failed',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Register the download route on the Connection service.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 */
export function apply(ctx) {
  const connection = ctx.get('connection')
  if (connection?.fetch?.register === undefined) {
    ctx.logger?.warn?.('session-save-as: connection.fetch is unavailable; the save-as route was not registered.')
    return
  }
  ctx.effect(() => connection.fetch.register({
    path: SAVE_AS_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleRequest(ctx, request),
  }), 'session-save-as: save-as route')
}
