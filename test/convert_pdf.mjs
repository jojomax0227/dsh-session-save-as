/**
 * Verify the real Word → PDF conversion path used by the Host route.
 *
 * The plugin asks the mounted Office converter (`office-kit`) to run LibreOffice
 * on the bytes it generated. This script reproduces that exact engine call
 * against the running Desktop installation, anchoring engine resolution at the
 * Kit entry the installation ships (native engine read from app.asar.unpacked).
 *
 * Run with the Desktop Electron binary as Node (ASAR-aware):
 *   set ELECTRON_RUN_AS_NODE=1
 *   "DeepSeek Harness.exe" test/convert_pdf.mjs out/session.docx out/session.pdf
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { statSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (inputPath === undefined || outputPath === undefined) {
  throw new Error('usage: convert_pdf.mjs <input.docx> <output.pdf>')
}

const INSTALL = 'D:/Program Files/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai'
const entry = pathToFileURL(`${INSTALL}/libreoffice-kit/lib/index.js`).href
const fromKit = createRequire(entry)

/** Map the first `.asar` segment to its unpacked copy, as office-kit does. */
const resolveEnginePackage = (name) => {
  const manifest = fromKit.resolve(`${name}/package.json`)
  return name === '@deepseek-ai/libreoffice-kit-wasm'
    ? manifest
    : manifest.replace(/\.asar(?=[\\/]|$)/u, '.asar.unpacked')
}

const nativeManifest = resolveEnginePackage('@deepseek-ai/libreoffice-kit-win32-x64')
console.log('engine manifest:', nativeManifest)
console.log('engine manifest exists:', statSync(nativeManifest).size > 0)

const { createConverter, discoverRuntime } = await import(entry)
console.log('runtime:', await discoverRuntime({ resolveEnginePackage }))

const converter = await createConverter({ timeoutMs: 300000, resolveEnginePackage })
try {
  const started = Date.now()
  const result = await converter.convert({ inputPath, outputPath })
  console.log('converted in ms:', Date.now() - started)
  console.log('result:', result)
  console.log('pdf bytes:', statSync(outputPath).size)
} finally {
  await converter.dispose()
}
