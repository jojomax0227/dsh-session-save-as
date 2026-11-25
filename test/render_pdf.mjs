/**
 * Render the generated PDF's first page to PNG so the result can be inspected.
 *
 * Run with the Desktop Electron binary as Node (ASAR-aware); see convert_pdf.mjs.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'

const [, , inputPath, outputDir] = process.argv
const INSTALL = 'D:/Program Files/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai'
const entry = pathToFileURL(`${INSTALL}/libreoffice-kit/lib/index.js`).href
const fromKit = createRequire(entry)
const resolveEnginePackage = (name) => {
  const manifest = fromKit.resolve(`${name}/package.json`)
  return name === '@deepseek-ai/libreoffice-kit-wasm'
    ? manifest
    : manifest.replace(/\.asar(?=[\\/]|$)/u, '.asar.unpacked')
}

const { createConverter } = await import(entry)
// The kit owns creation of a fresh output directory; an existing one is rejected.
rmSync(outputDir, { recursive: true, force: true })
const converter = await createConverter({ timeoutMs: 300000, resolveEnginePackage })
try {
  const result = await converter.renderImages({
    inputPath,
    outputDir,
    pages: [1],
    dpi: 110,
    maxPages: 4,
    maxPixels: 16_000_000,
    maxDimension: 10_000,
  })
  console.log(JSON.stringify(result.images.map((image) => ({ path: image.path, width: image.width, height: image.height })), null, 2))
  console.log('pageCount:', result.pageCount)
} finally {
  await converter.dispose()
}
