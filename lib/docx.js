/**
 * Render the flat document model as a WordprocessingML (`.docx`) package.
 *
 * The output is a self-contained OOXML archive: content types, package
 * relationships, the main document part, its styles, and core properties. Word
 * and LibreOffice both open it, so the Host route can either send it as Word or
 * hand it to the Office converter for PDF.
 */
import { zip } from './zip.js'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const BODY_FONT = 'Calibri'
const EAST_ASIA_FONT = 'Microsoft YaHei'
const MONO_FONT = 'Consolas'

// XML 1.0 forbids most C0 control characters; strip them instead of failing.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu

/**
 * Escape text for use inside an XML text node or attribute value.
 * @param {string} text - raw text.
 * @returns {string} escaped text safe for WordprocessingML.
 */
function escapeXml(text) {
  return String(text)
    .replace(INVALID_XML, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

/**
 * Build the run properties element for one inline run.
 * @param {{ bold?: boolean, italic?: boolean, code?: boolean }} run - styled run.
 * @returns {string} `w:rPr` element or an empty string.
 */
function runProperties(run) {
  const parts = []
  if (run.code === true) {
    parts.push(`<w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/>`)
  }
  if (run.bold === true) parts.push('<w:b/><w:bCs/>')
  if (run.italic === true) parts.push('<w:i/><w:iCs/>')
  return parts.length === 0 ? '' : `<w:rPr>${parts.join('')}</w:rPr>`
}

/**
 * Render one inline run, expanding newlines to line breaks.
 * @param {{ text: string, bold?: boolean, italic?: boolean, code?: boolean }} run - run to render.
 * @returns {string} `w:r` element.
 */
function runXml(run) {
  const text = String(run.text).replace(/\t/gu, run.code === true ? '    ' : ' ')
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const content = lines
    .map((line, index) => `${index === 0 ? '' : '<w:br/>'}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('')
  return `<w:r>${runProperties(run)}${content}</w:r>`
}

/**
 * Render one styled paragraph.
 * @param {string} style - paragraph style id.
 * @param {ReadonlyArray<Record<string, unknown>>} runs - inline runs.
 * @param {string} [extraParagraphProperties] - additional `w:pPr` children.
 * @returns {string} `w:p` element.
 */
function paragraphXml(style, runs, extraParagraphProperties = '') {
  const content = runs.map((run) => runXml(run)).join('')
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extraParagraphProperties}</w:pPr>${content}</w:p>`
}

/**
 * Render one code line without inline styling.
 * @param {string} line - source line, already free of indentation loss.
 * @returns {string} `w:p` element.
 */
function codeLineXml(line) {
  const text = line.replace(/\t/gu, '    ').replace(/\r/gu, '')
  const safe = text === '' ? ' ' : text
  return `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(safe)}</w:t></w:r></w:p>`
}

/**
 * Render one document block.
 * @param {Record<string, any>} block - model block.
 * @returns {string} one or more WordprocessingML paragraph elements.
 */
function blockXml(block) {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(block.level) || 1))
      return paragraphXml(`Heading${level}`, block.runs ?? [])
    }
    case 'speaker':
      return paragraphXml(block.role === 'user' ? 'SpeakerUser' : 'SpeakerAssistant', [
        { text: String(block.text ?? ''), bold: true },
      ])
    case 'paragraph':
      return paragraphXml('Body', block.runs ?? [])
    case 'quote':
      return paragraphXml('Quote', block.runs ?? [])
    case 'list': {
      const level = Math.min(2, Math.max(0, Number(block.level) || 0))
      const indent = level === 0 ? '' : `<w:ind w:left="${420 + level * 420}"/>`
      return paragraphXml('ListItem', [
        { text: `${String(block.marker ?? '•')} ` },
        ...(block.runs ?? []),
      ], indent)
    }
    case 'code':
      return (block.lines ?? []).map((line) => codeLineXml(String(line))).join('')
    case 'divider':
      return '<w:p><w:pPr><w:pStyle w:val="Divider"/></w:pPr></w:p>'
    default:
      return ''
  }
}

/**
 * Build the main document part.
 * @param {{ title: string, subtitle: string, blocks: ReadonlyArray<Record<string, unknown>> }} model - document model.
 * @returns {string} `word/document.xml` content.
 */
function documentXml(model) {
  const body = [
    paragraphXml('Title', [{ text: model.title }]),
    paragraphXml('Subtitle', [{ text: model.subtitle }]),
    '<w:p><w:pPr><w:pStyle w:val="Divider"/></w:pPr></w:p>',
    ...model.blocks.map((block) => blockXml(block)),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="851" w:footer="992" w:gutter="0"/>'
      + '<w:cols w:space="425"/></w:sectPr>',
  ].join('')
  return `${XML_DECLARATION}<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>${body}</w:body></w:document>`
}

/**
 * Build the shared paragraph and character styles.
 * @returns {string} `word/styles.xml` content.
 */
function stylesXml() {
  const fonts = `<w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${EAST_ASIA_FONT}" w:cs="${BODY_FONT}"/>`
  const style = (id, name, body, basedOn = 'Normal') =>
    `<w:style w:type="paragraph"${id === 'Normal' ? ' w:default="1"' : ''} w:styleId="${id}">`
    + `<w:name w:val="${name}"/>${id === 'Normal' ? '' : `<w:basedOn w:val="${basedOn}"/>`}<w:qFormat/>${body}</w:style>`
  return `${XML_DECLARATION}<w:styles xmlns:w="${WORD_NS}">`
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + `${fonts}<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>`
    + '</w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    + '</w:docDefaults>'
    + style('Normal', 'Normal', '')
    + style('Body', 'Body', '')
    + style('Title', 'Title', '<w:pPr><w:spacing w:before="0" w:after="120"/><w:contextualSpacing/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="1F2328"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr>')
    + style('Subtitle', 'Subtitle', '<w:pPr><w:spacing w:before="0" w:after="120"/><w:contextualSpacing/></w:pPr>'
      + '<w:rPr><w:color w:val="6E7781"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>')
    + style('Heading1', 'heading 1', '<w:pPr><w:keepNext/><w:spacing w:before="320" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="1F2328"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>')
    + style('Heading2', 'heading 2', '<w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="1F2328"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>')
    + style('Heading3', 'heading 3', '<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="1F2328"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>')
    + style('SpeakerUser', 'Speaker User', '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="80"/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="1F6FEB"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>')
    + style('SpeakerAssistant', 'Speaker Assistant', '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="80"/></w:pPr>'
      + '<w:rPr><w:b/><w:bCs/><w:color w:val="0F7B4F"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>')
    + style('Quote', 'Quote', '<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="D0D7DE"/></w:pBdr>'
      + '<w:ind w:left="420"/><w:spacing w:before="80" w:after="80"/></w:pPr>'
      + '<w:rPr><w:color w:val="57606A"/></w:rPr>')
    + style('CodeBlock', 'Code Block', '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>'
      + '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="120"/></w:pPr>'
      + `<w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/>`
      + '<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>')
    + style('ListItem', 'List Item', '<w:pPr><w:ind w:left="420"/><w:spacing w:before="0" w:after="60"/></w:pPr>')
    + style('Divider', 'Divider', '<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D7DE"/></w:pBdr>'
      + '<w:spacing w:before="120" w:after="240"/></w:pPr>')
    + '</w:styles>'
}

/**
 * Build the package content types part.
 * @returns {string} `[Content_Types].xml` content.
 */
function contentTypesXml() {
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '</Types>'
}

/**
 * Build the package relationship part.
 * @returns {string} `_rels/.rels` content.
 */
function packageRelationshipsXml() {
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '</Relationships>'
}

/**
 * Build the main document's relationship part.
 * @returns {string} `word/_rels/document.xml.rels` content.
 */
function documentRelationshipsXml() {
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>'
}

/**
 * Build the core properties part.
 * @param {{ title: string, exportedAt: Date }} model - document model.
 * @returns {string} `docProps/core.xml` content.
 */
function corePropertiesXml(model) {
  const stamp = model.exportedAt.toISOString().replace(/\.\d{3}Z$/u, 'Z')
  return `${XML_DECLARATION}<cp:coreProperties`
    + ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
    + ' xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:dcmitype="http://purl.org/dc/dcmitype/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${escapeXml(model.title)}</dc:title>`
    + '<dc:creator>DeepSeek Harness</dc:creator>'
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>`
    + '</cp:coreProperties>'
}

/**
 * Build a complete Word document from the flat model.
 * @param {{ title: string, subtitle: string, exportedAt: Date, blocks: ReadonlyArray<Record<string, unknown>> }} model - document model.
 * @returns {Buffer} `.docx` archive bytes.
 */
export function buildDocx(model) {
  return zip([
    { name: '[Content_Types].xml', data: contentTypesXml() },
    { name: '_rels/.rels', data: packageRelationshipsXml() },
    { name: 'docProps/core.xml', data: corePropertiesXml(model) },
    { name: 'word/document.xml', data: documentXml(model) },
    { name: 'word/styles.xml', data: stylesXml() },
    { name: 'word/_rels/document.xml.rels', data: documentRelationshipsXml() },
  ], model.exportedAt)
}
