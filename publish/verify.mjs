/**
 * Validate the publishing artifacts before opening a pull request.
 *
 * Checks the package manifest against the bundle rules, the market entry file,
 * and the self-hosted index against DSH's own format-1 validator, then prints
 * the exact install spec the index produces.
 *
 * The validator lives in the DSH installation, which is packed in app.asar, so
 * run this with the Desktop Electron binary acting as Node:
 *
 *   $env:ELECTRON_RUN_AS_NODE = "1"
 *   & "D:\Program Files\DeepSeek Harness\DeepSeek Harness.exe" publish/verify.mjs
 *
 * `DSH_INSTALL_DIR` overrides the installation anchor when it is set.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const install = process.env.DSH_INSTALL_DIR
  ?? 'D:/Program Files/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh'

const requireFromDsh = createRequire(join(install, 'package.json'))
const yaml = requireFromDsh('js-yaml')
const semver = requireFromDsh('semver')
const validator = await import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/dsh-plugin-market-index')).href)

const failures = []
const check = (condition, message) => {
  if (condition) {
    console.log('ok   ' + message)
  } else {
    failures.push(message)
    console.log('FAIL ' + message)
  }
}

// --- package.json ---------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check(pkg.private !== true, 'package.json has no "private": true (npm and the market skip private packages)')
check(typeof pkg.name === 'string' && pkg.name !== '', 'package.json has a name')
check(pkg.dsh?.bundle?.patch !== undefined, 'package.json declares dsh.bundle.patch')
check(existsSync(join(root, pkg.dsh?.bundle?.patch ?? 'missing')), 'the declared patch file exists')
check(pkg.dsh?.client?.platform === 'web', 'package.json declares dsh.client.platform = web')
check(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh !== '', 'package.json declares engines.dsh')
const cliVersion = JSON.parse(readFileSync(join(install, 'package.json'), 'utf8')).version
check(
  semver.satisfies(cliVersion, pkg.engines.dsh),
  'engines.dsh accepts the installed DSH ' + cliVersion,
)
check(pkg.repository?.url?.includes('jojomax0227/dsh-session-save-as') === true, 'repository points at the publishing repo')
check(pkg.license === 'MIT', 'license is declared')
check(existsSync(join(root, 'LICENSE')), 'LICENSE file exists')
check(pkg.files?.includes('client.js') === true && pkg.files?.includes('lib') === true, 'files lists the runtime halves')

// --- awesome-dsh-plugin entry --------------------------------------------
const entry = yaml.load(readFileSync(join(here, 'awesome-entry.yml'), 'utf8'))
check(entry.url === 'https://github.com/jojomax0227/dsh-session-save-as', 'entry url points at the repo')
check(entry.name === 'jojomax0227/dsh-session-save-as', 'entry name is owner/repo')
check(typeof entry.category === 'string' && entry.category !== '', 'entry declares a category')
check(entry.description?.en !== undefined && entry.description?.zh !== undefined, 'entry has en and zh descriptions')
check(
  typeof entry.tarball === 'string'
  && entry.tarball.endsWith('/releases/latest/download/dsh-session-save-as.tgz'),
  'entry tarball uses the stable release asset name',
)

// --- self-hosted format-1 index ------------------------------------------
const indexUrl = 'https://jojomax0227.github.io/dsh-session-save-as/index.json'
const rawIndex = JSON.parse(readFileSync(join(here, 'index.json'), 'utf8'))
let parsed
try {
  parsed = validator.parseMarketIndex(rawIndex, indexUrl)
  console.log('ok   index passes DSH parseMarketIndex')
} catch (error) {
  failures.push('index must pass parseMarketIndex')
  console.log('FAIL index rejected: ' + (error?.path ?? '') + ' ' + (error?.reason ?? error?.message ?? String(error)))
}

if (parsed !== undefined) {
  const plugin = parsed.plugins[0]
  check(parsed.plugins.length === 1 && plugin.name === pkg.name, 'index lists exactly this package')
  check(plugin.versions[0].version === pkg.version, 'index version matches package.json')
  const iconRelative = rawIndex.plugins[0].icon
  const iconPath = join(here, iconRelative)
  check(!iconRelative.includes('://') && existsSync(iconPath), 'index icon file exists beside the index: ' + iconRelative)
  console.log('     resolved icon url: ' + plugin.icon)
  const target = validator.marketInstallTarget(plugin.name, plugin.versions[0])
  console.log('     install target: ' + JSON.stringify(target))
  check(target.spec === `${pkg.name}@${pkg.version}`, 'index install spec is name@version')
}

if (failures.length > 0) {
  console.error('\n' + failures.length + ' check(s) failed')
  process.exit(1)
}
console.log('\nall publishing checks passed')
