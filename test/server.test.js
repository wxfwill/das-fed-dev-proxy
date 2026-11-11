import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { startDevProxy } from '../src/server.js'

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', reject)
    resolve(server.address().port)
  })
})

const close = (server) => new Promise((resolve) => server.close(() => resolve()))

const getFreePort = async () => {
  const server = http.createServer()
  const port = await listen(server)
  await close(server)
  return port
}

const request = (port, path, options = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, ...options }, (res) => {
    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }))
  })
  req.on('error', reject)
  if (options.body) req.write(options.body)
  req.end()
})

test('proxies local methods, request bodies, query strings, and fallback paths', async (t) => {
  const local = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => res.end(`${req.method} ${req.url} ${Buffer.concat(chunks).toString()}`))
  })
  const fallback = http.createServer((req, res) => res.end(`fallback ${req.url}`))
  const localPort = await listen(local)
  const fallbackPort = await listen(fallback)
  const proxy = await startDevProxy({
    listen: { host: '127.0.0.1', port: await getFreePort() },
    fallback: `http://127.0.0.1:${fallbackPort}`,
    routes: [{ prefix: '/enterpriseadmin/AppEngine/', target: `http://127.0.0.1:${localPort}` }],
    devServer: { port: localPort },
  })
  t.after(async () => {
    await proxy.close()
    await close(local)
    await close(fallback)
  })

  const localResponse = await request(proxy.address.port, '/enterpriseadmin/AppEngine/api/items?q=1', {
    method: 'POST',
    body: 'payload',
  })
  assert.equal(localResponse.status, 200)
  assert.equal(localResponse.body, 'POST /enterpriseadmin/AppEngine/api/items?q=1 payload')

  const fallbackResponse = await request(proxy.address.port, '/api/session?next=%2Fhome')
  assert.equal(fallbackResponse.body, 'fallback /api/session?next=%2Fhome')
})

test('returns 502 rather than falling back when a local route is unavailable', async (t) => {
  const unused = http.createServer()
  const localPort = await listen(unused)
  await close(unused)
  const fallback = http.createServer((req, res) => res.end('must not be used'))
  const fallbackPort = await listen(fallback)
  const listener = http.createServer()
  const listenPort = await listen(listener)
  await close(listener)
  const proxy = await startDevProxy({
    listen: { host: '127.0.0.1', port: listenPort },
    fallback: `http://127.0.0.1:${fallbackPort}`,
    routes: [{ prefix: '/local/', target: `http://127.0.0.1:${localPort}` }],
    devServer: { port: localPort },
  })
  t.after(async () => {
    await proxy.close()
    await close(fallback)
  })

  const response = await request(proxy.address.port, '/local/missing')
  assert.equal(response.status, 502)
})

test('rewrites login redirects and cookie domains to the local origin', async (t) => {
  let fallbackPort
  const fallback = http.createServer((req, res) => {
    res.writeHead(302, {
      location: `http://127.0.0.1:${fallbackPort}/login`,
      'set-cookie': 'session=abc; Domain=172.168.51.175; Path=/; HttpOnly',
    })
    res.end()
  })
  fallbackPort = await listen(fallback)
  const localPort = await getFreePort()
  const proxy = await startDevProxy({
    listen: { host: '127.0.0.1', port: await getFreePort() },
    fallback: `http://127.0.0.1:${fallbackPort}`,
    routes: [{ prefix: '/local/', target: `http://127.0.0.1:${localPort}` }],
    devServer: { port: localPort },
  })
  t.after(async () => {
    await proxy.close()
    await close(fallback)
  })

  const response = await request(proxy.address.port, '/auth/start')
  assert.equal(response.status, 302)
  assert.equal(response.headers.location, `http://127.0.0.1:${proxy.address.port}/login`)
  assert.match(response.headers['set-cookie'][0], /^session=abc;/)
  assert.doesNotMatch(response.headers['set-cookie'][0], /Domain=/i)
})

test('proxies WebSocket upgrades to the same path router', async (t) => {
  let resolveUpstreamPath
  const upstreamPath = new Promise((resolve) => { resolveUpstreamPath = resolve })
  const upstream = http.createServer()
  upstream.on('upgrade', (req, socket) => {
    resolveUpstreamPath(req.url)
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  })
  const upstreamInfo = { upstream, port: await listen(upstream) }
  const proxy = await startDevProxy({
    listen: { host: '127.0.0.1', port: await getFreePort() },
    fallback: `http://127.0.0.1:${upstreamInfo.port}`,
    routes: [{ prefix: '/app/', target: `http://127.0.0.1:${upstreamInfo.port}` }],
    devServer: { port: upstreamInfo.port },
  })
  t.after(async () => {
    await proxy.close()
    await close(upstreamInfo.upstream)
  })

  const urlPromise = new Promise((resolve, reject) => {
    const socket = net.connect(proxy.address.port, '127.0.0.1', () => {
      socket.write([
        'GET /app/hmr?token=abc HTTP/1.1',
        `Host: 127.0.0.1:${proxy.address.port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'))
    })
    socket.once('data', (data) => {
      socket.destroy()
      resolve(data.toString())
    })
    socket.once('error', reject)
  })
  const response = await urlPromise
  assert.match(response, /^HTTP\/1\.1 101/)
  assert.equal(await upstreamPath, '/app/hmr?token=abc')
})
