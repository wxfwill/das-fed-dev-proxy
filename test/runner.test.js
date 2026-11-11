import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { runWithProxy } from '../src/runner.js'

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', reject)
    resolve(server.address().port)
  })
})

const configForPort = (listenPort, targetPort) => ({
  listen: { host: '127.0.0.1', port: listenPort },
  fallback: 'http://127.0.0.1:1',
  routes: [{ prefix: '/local/', target: `http://127.0.0.1:${targetPort}` }],
  devServer: { port: targetPort },
})

const getFreePort = async () => {
  const server = http.createServer()
  const port = await listen(server)
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('returns the first child exit code and stops sibling processes', async () => {
  const result = await runWithProxy({
    config: configForPort(await getFreePort(), await getFreePort()),
    commands: [
      { command: process.execPath, args: ['-e', 'setTimeout(() => process.exit(7), 80)'] },
      { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
    ],
  })
  assert.equal(result, 7)
})

test('does not spawn commands when the proxy port cannot bind', async () => {
  const occupied = http.createServer()
  const port = await listen(occupied)
  const marker = `dev-proxy-should-not-run-${process.pid}`
  const command = `${JSON.stringify(marker)}; process.exit(17)`
  await assert.rejects(runWithProxy({
    config: configForPort(port, await getFreePort()),
    commands: [{ command: process.execPath, args: ['-e', command] }],
  }))
  await new Promise((resolve) => occupied.close(resolve))
})
