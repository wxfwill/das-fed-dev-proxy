import test from 'node:test'
import assert from 'node:assert/strict'
import { validateProxyConfig } from '../src/config.js'
import { resolveTarget } from '../src/resolve-target.js'

const config = validateProxyConfig({
  listen: { host: '127.0.0.1', port: 8101 },
  fallback: 'http://172.168.51.175',
  routes: [
    { prefix: '/enterpriseadmin/', target: 'http://127.0.0.1:5174' },
    { prefix: '/enterpriseadmin/AppEngine/', target: 'http://127.0.0.1:5173' },
  ],
  devServer: { port: 5173 },
})

test('uses the longest matching path prefix', () => {
  assert.equal(resolveTarget('/enterpriseadmin/AppEngine/src/main.ts', config).target, 'http://127.0.0.1:5173')
})

test('matches paths case-sensitively and on segment boundaries', () => {
  assert.equal(resolveTarget('/enterpriseadmin/AppEngine', config).target, 'http://127.0.0.1:5173')
  assert.equal(resolveTarget('/enterpriseadmin/appengine/', config).target, 'http://127.0.0.1:5174')
  assert.equal(resolveTarget('/enterpriseadmin/other', config).target, 'http://127.0.0.1:5174')
  assert.equal(resolveTarget('/enterpriseadministrator/other', config).type, 'fallback')
})

test('rejects non-loopback listeners and local targets', () => {
  assert.throws(() => validateProxyConfig({
    listen: { host: '0.0.0.0', port: 8101 },
    fallback: 'http://172.168.51.175',
    routes: [{ prefix: '/app/', target: 'http://127.0.0.1:5173' }],
    devServer: { port: 5173 },
  }), /loopback/)
  assert.throws(() => validateProxyConfig({
    listen: { host: '127.0.0.1', port: 8101 },
    fallback: 'http://172.168.51.175',
    routes: [{ prefix: '/app/', target: 'http://example.com:5173' }],
    devServer: { port: 5173 },
  }), /loopback/)
})
