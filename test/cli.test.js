import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { main } from '../src/cli.js'

const getFreePort = async () => {
  const server = http.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('standalone run wraps a command without requiring upf-cli', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'das-dev-proxy-'))
  const listenPort = await getFreePort()
  const targetPort = await getFreePort()
  const configPath = path.join(tempDir, 'dev-proxy.config.json')
  await fs.writeFile(configPath, JSON.stringify({
    listen: { host: '127.0.0.1', port: listenPort },
    fallback: 'http://127.0.0.1:1',
    routes: [{ prefix: '/local/', target: `http://127.0.0.1:${targetPort}` }],
    devServer: { port: targetPort },
  }))

  try {
    const exitCode = await main(['run', '--config', configPath, '--', process.execPath, '-e', 'process.exit(4)'])
    assert.equal(exitCode, 4)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
