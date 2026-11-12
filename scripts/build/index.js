import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const example = resolve(root, 'examples/vite-subapp')
const viteCli = resolve(example, 'node_modules/vite/bin/vite.js')
const packageCli = resolve(example, 'node_modules/das-fed-dev-proxy/bin/das-dev-proxy.js')
const config = resolve(root, 'examples/dev-proxy.config.json')
const host = 'http://127.0.0.1:8101'

const run = async (command, args, cwd = root) => {
  await execa(command, args, { cwd, stdio: 'inherit' })
}

const verifyPublishedFiles = async () => {
  const { stdout } = await execa('npm', ['pack', '--dry-run', '--json'], { cwd: root })
  const [packageInfo] = JSON.parse(stdout)
  const files = packageInfo.files.map(({ path }) => path)

  assert(files.includes('dist/index.js'), 'npm package must contain dist/index.js')
  assert(files.includes('dist/cli.js'), 'npm package must contain dist/cli.js')
  assert(files.includes('bin/das-dev-proxy.js'), 'npm package must contain its CLI entry')
  assert(!files.some((path) => path.startsWith('examples/')), 'npm package must not contain examples')
  assert(!files.some((path) => path.startsWith('src/')), 'npm package must publish dist, not source files')
  console.log('[build] npm package contents verified; examples and src are excluded')
}

const verifyDemo = async () => {
  await execa(process.execPath, [
    '--input-type=module',
    '-e',
    "import('das-fed-dev-proxy').then((api) => { for (const key of ['loadProxyConfig', 'validateProxyConfig', 'resolveTarget', 'startDevProxy', 'runWithProxy']) if (!(key in api)) throw new Error(`Missing export: ${key}`) })",
  ], { cwd: example })

  const fallback = execa(process.execPath, [resolve(root, 'examples/local-host/server.js')], {
    cwd: root,
    reject: false,
    stdout: 'ignore',
    stderr: 'ignore',
  })
  const demo = execa(process.execPath, [
    packageCli,
    'run', '--config', config, '--',
    process.execPath, viteCli,
    'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--base', '/demo/',
  ], {
    cwd: example,
    reject: false,
    stdout: 'ignore',
    stderr: 'ignore',
  })

  try {
    let demoPage
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      if (demo.exitCode !== null) throw new Error(`Demo process exited early with code ${demo.exitCode}`)
      try {
        const candidate = await fetch(`${host}/demo/`, { signal: AbortSignal.timeout(1000) })
        if (candidate.ok) {
          demoPage = candidate
          break
        }
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    }
    assert(demoPage?.ok, 'built Vite demo did not become ready within 20 seconds')

    const html = await demoPage.text()
    assert.match(html, /Vite sub-application/)
    const fallbackPage = await fetch(`${host}/`)
    assert.equal(fallbackPage.status, 200, 'fallback host must remain reachable through the package proxy')
    assert.match(await fallbackPage.text(), /Local fallback host/)
    const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1]
    assert(scriptPath, 'built demo must reference a JavaScript bundle')
    const asset = await fetch(new URL(scriptPath, `${host}/demo/`))
    assert.equal(asset.status, 200, 'built demo JavaScript bundle must load through the proxy')
    assert.match(await asset.text(), /health-check/)

    const health = await fetch(`${host}/api/health`)
    assert.equal(health.status, 200, 'fallback API must remain reachable through the package proxy')
    assert.deepEqual(await health.json(), { ok: true, source: 'local fallback host' })
  } finally {
    demo.kill('SIGTERM')
    fallback.kill('SIGTERM')
    await Promise.all([demo, fallback])
  }

  console.log('[build] installed package CLI and built demo integration verified')
}

const main = async () => {
  console.log('[build] building npm package with Vite')
  await run('pnpm', ['exec', 'vite', 'build'])
  await run('pnpm', ['--dir', 'examples/vite-subapp', 'install', '--frozen-lockfile'])
  await run('pnpm', ['--dir', 'examples/vite-subapp', 'run', 'build'])
  await run(process.execPath, ['--test'])
  await verifyPublishedFiles()
  await verifyDemo()
}

main().catch((error) => {
  console.error(`[build] ${error.stack || error.message}`)
  process.exitCode = 1
})
