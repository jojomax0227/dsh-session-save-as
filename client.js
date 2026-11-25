/**
 * Browser half of the "Save session as" bundle.
 *
 * It contributes one `另存为` entry with `PDF` and `Word` children to the
 * conversation header's more-actions menu, then asks the Host route for the
 * rendered document and hands the bytes to the browser download manager.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-save-as',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'session-save-as'

    const zh = {
      'menu.saveAs': '另存为',
      'menu.pdf': 'PDF 文档（.pdf）',
      'menu.docx': 'Word 文档（.docx）',
      'format.pdf': 'PDF',
      'format.docx': 'Word',
      'toast.preparing': '正在生成 {format} 文档，请稍候…',
      'toast.saved': '已生成 {name}',
      'toast.failed': '无法导出会话文档：{message}',
      'error.badRequest': '导出请求参数无效。',
      'error.missingSession': '会话不存在或已被删除。',
      'error.missingService': '当前环境缺少会话读取服务，无法导出。',
      'error.readFailed': '无法读取会话内容，请重试。',
      'error.pdfUnavailable': '当前环境未启用 Office 文档转换，无法生成 PDF；请改用 Word 格式保存。',
      'error.pdfFailed': 'PDF 转换失败，请改用 Word 格式保存。',
    }
    const en = {
      'menu.saveAs': 'Save as',
      'menu.pdf': 'PDF document (.pdf)',
      'menu.docx': 'Word document (.docx)',
      'format.pdf': 'PDF',
      'format.docx': 'Word',
      'toast.preparing': 'Generating the {format} document…',
      'toast.saved': 'Saved {name}',
      'toast.failed': 'Could not save the session document: {message}',
      'error.badRequest': 'The save request was invalid.',
      'error.missingSession': 'This session no longer exists.',
      'error.missingService': 'Session reading is unavailable in this profile.',
      'error.readFailed': 'Could not read the session. Try again.',
      'error.pdfUnavailable': 'PDF conversion is not available in this profile. Save as Word instead.',
      'error.pdfFailed': 'PDF conversion failed. Save as Word instead.',
    }
    const ERROR_KEYS = {
      'bad-request': 'error.badRequest',
      'missing-session': 'error.missingSession',
      'missing-service': 'error.missingService',
      'read-failed': 'error.readFailed',
      'pdf-unavailable': 'error.pdfUnavailable',
      'pdf-failed': 'error.pdfFailed',
    }

    /**
     * Draw the menu glyph shared by the parent action.
     * @returns {object} React element.
     */
    function SaveAsIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('path', { d: 'M9 1.75H4.75a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-7.5z' }),
        h('path', { d: 'M9 1.75v4h4' }),
        h('path', { d: 'M8 8.25v3.75' }),
        h('path', { d: 'M6.5 10.5 8 12l1.5-1.5' }),
      )
    }

    /**
     * Draw the PDF child glyph.
     * @returns {object} React element.
     */
    function PdfIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('path', { d: 'M9 1.75H4.75a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-7.5z' }),
        h('path', { d: 'M9 1.75v4h4' }),
        h('path', { d: 'M6 12.25h4' }),
        h('path', { d: 'M6 9.25h4' }),
      )
    }

    /**
     * Draw the Word child glyph.
     * @returns {object} React element.
     */
    function WordIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('path', { d: 'M9 1.75H4.75a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-7.5z' }),
        h('path', { d: 'M9 1.75v4h4' }),
        h('path', { d: 'M6.25 8.5 7.5 12l1.5-2.5L10.5 12l1.25-3.5' }),
      )
    }

    /**
     * Build one coded failure the menu can localize.
     * @param {string} code - machine code understood by {@link ERROR_KEYS}.
     * @param {string} message - diagnostic text.
     * @returns {Error} coded error.
     */
    function codedError(code, message) {
      const error = new Error(message)
      error.code = code
      return error
    }

    /**
     * Read the UTF-8 file name from a Content-Disposition header.
     * @param {string | null} header - response header value.
     * @returns {string | null} decoded file name, when present.
     */
    function filenameFromHeader(header) {
      if (header === null || header === '') return null
      const extended = /filename\*=UTF-8''([^;]+)/iu.exec(header)
      if (extended !== null) {
        try {
          return decodeURIComponent(extended[1])
        } catch (error) {
          return null
        }
      }
      const plain = /filename="([^"]+)"/iu.exec(header)
      return plain === null ? null : plain[1]
    }

    /**
     * Hand one generated document to the browser download manager.
     * @param {Blob} blob - document bytes.
     * @param {string} filename - download file name.
     */
    function saveBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.rel = 'noopener'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        setTimeout(() => { URL.revokeObjectURL(url) }, 60000)
      }
    }

    /**
     * Ask the Host for one document and start the download.
     * @param {object} ctx - browser plugin context.
     * @param {(key: string, params?: object) => string} t - namespaced translate function.
     * @param {string} sessionId - Session to export.
     * @param {'pdf' | 'docx'} format - requested document format.
     * @returns {Promise<void>} resolves after the download starts.
     */
    async function downloadDocument(ctx, t, sessionId, format) {
      const lang = typeof navigator !== 'undefined' && String(navigator.language).toLowerCase().startsWith('zh')
        ? 'zh'
        : 'en'
      const query = new URLSearchParams({ sessionId, format, lang })
      ctx.contextMenus.notify(t('toast.preparing', { format: t(`format.${format}`) }))
      const response = await fetch(`api/session.saveas?${query.toString()}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        let code = ''
        let message = `HTTP ${response.status}`
        try {
          const body = await response.json()
          if (typeof body?.code === 'string') code = body.code
          if (typeof body?.message === 'string' && body.message !== '') message = body.message
        } catch (error) {
          // A non-JSON failure body keeps the status-based message.
        }
        throw codedError(code, message)
      }
      const filename = filenameFromHeader(response.headers.get('content-disposition'))
        ?? `session.${format === 'pdf' ? 'pdf' : 'docx'}`
      const blob = await response.blob()
      saveBlob(blob, filename)
      ctx.contextMenus.notify(t('toast.saved', { name: filename }), true)
    }

    /**
     * Run one save action, surfacing every failure as a localized toast.
     * @param {object} ctx - browser plugin context.
     * @param {(key: string, params?: object) => string} t - translate function.
     * @param {string} sessionId - Session to export.
     * @param {'pdf' | 'docx'} format - requested document format.
     * @returns {Promise<void>} resolves once the toast is published.
     */
    async function runSave(ctx, t, sessionId, format) {
      try {
        await downloadDocument(ctx, t, sessionId, format)
      } catch (error) {
        const key = error?.code !== undefined ? ERROR_KEYS[error.code] : undefined
        const message = error instanceof Error ? error.message : String(error)
        ctx.contextMenus.notify(key === undefined ? t('toast.failed', { message }) : t(key))
      }
    }

    return {
      name: NS,
      inject: ['contextMenus', 'locale', 'slots'],
      /**
       * Register dictionaries, menu glyphs, and the header save-as actions.
       * @param {object} ctx - browser plugin context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-save-as: browser dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('contextMenu.icon', function* () {
          const glyphs = {
            [`${NS}.save`]: SaveAsIcon,
            [`${NS}.pdf`]: PdfIcon,
            [`${NS}.docx`]: WordIcon,
          }
          for (const [key, Icon] of Object.entries(glyphs)) {
            yield ctx.slots.register({ name: 'contextMenu.icon', key }, Icon)
          }
        })
        ctx.effect(() => ctx.contextMenus.register({
          id: NS,
          target: 'sessionHeader',
          order: 120,
          observe: () => [ctx.locale],
          resolve: ({ sessionId }) => [{
            id: 'save-as',
            label: t('menu.saveAs'),
            icon: { key: `${NS}.save` },
            children: [
              {
                id: 'pdf',
                label: t('menu.pdf'),
                icon: { key: `${NS}.pdf` },
                run: () => runSave(ctx, t, sessionId, 'pdf'),
              },
              {
                id: 'docx',
                label: t('menu.docx'),
                icon: { key: `${NS}.docx` },
                run: () => runSave(ctx, t, sessionId, 'docx'),
              },
            ],
          }],
        }), 'session-save-as: header save-as actions')
      },
    }
  },
})
