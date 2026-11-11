import { isIP } from 'node:net'
import { isAbsolute, resolve } from 'node:path'
import fs from 'node:fs/promises'

const isLoopbackHost = (host) => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === 'localhost' || normalized === '::1') return true
  return isIP(normalized) === 4 && normalized.startsWith('127.')
}

const parseHttpUrl = (value, name) => {
  let url
  try { url = new URL(value) } catch { throw new Error(`${name} must be a valid http or https URL`) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be a credential-free http or https URL`)
  }
  return url
}

const validatePort = (value, name) => {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }
  return value
}

const validatePrefix = (prefix) => {
  if (typeof prefix !== 'string' || !prefix.startsWith('/') || prefix.includes('?') || prefix.includes('#')) {
    throw new Error('Each route prefix must be an absolute URL path without query or hash')
  }
  return prefix
}

export const validateProxyConfig = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Proxy config must be a JSON object')
  const listen = input.listen || {}
  const host = listen.host || '127.0.0.1'
  if (!isLoopbackHost(host)) throw new Error('listen.host must resolve to a loopback address')
  const port = validatePort(listen.port, 'listen.port')
  const fallback = parseHttpUrl(input.fallback, 'fallback').toString().replace(/\/$/, '')
  if (!Array.isArray(input.routes) || input.routes.length === 0) throw new Error('routes must contain at least one local path mapping')

  const routes = input.routes.map((route, index) => {
    if (!route || typeof route !== 'object') throw new Error(`routes[${index}] must be an object`)
    const prefix = validatePrefix(route.prefix)
    const target = parseHttpUrl(route.target, `routes[${index}].target`)
    if (!isLoopbackHost(target.hostname)) throw new Error(`routes[${index}].target must point to a loopback service`)
    if (!target.port) throw new Error(`routes[${index}].target must include an explicit port`)
    return { prefix, target: target.toString().replace(/\/$/, '') }
  })
  const devServerPort = validatePort(input.devServer?.port, 'devServer.port')
  const devServerRoute = routes.find(({ target }) => Number(new URL(target).port) === devServerPort)
  if (!devServerRoute) {
    throw new Error('devServer.port must match one of the local route target ports')
  }
  const devServerBase = input.devServer.base
  if (devServerBase !== undefined && (
    typeof devServerBase !== 'string' || !devServerBase.startsWith('/') || !devServerBase.endsWith('/') ||
    devServerBase.includes('?') || devServerBase.includes('#') || devServerBase !== devServerRoute.prefix
  )) {
    throw new Error('devServer.base must be an absolute path ending in / and match its local route prefix')
  }
  return Object.freeze({
    listen: Object.freeze({ host, port }),
    fallback,
    routes: Object.freeze(routes.sort((left, right) => right.prefix.length - left.prefix.length)),
    devServer: Object.freeze({ port: devServerPort, ...(devServerBase ? { base: devServerBase } : {}) }),
  })
}

export const loadProxyConfig = async (configPath, cwd = process.cwd()) => {
  if (typeof configPath !== 'string' || configPath.length === 0) throw new Error('A --config path is required')
  const absolutePath = isAbsolute(configPath) ? configPath : resolve(cwd, configPath)
  const content = await fs.readFile(absolutePath, 'utf8')
  let parsed
  try { parsed = JSON.parse(content) } catch (error) {
    throw new Error(`Invalid JSON in ${absolutePath}: ${error.message}`)
  }
  return validateProxyConfig(parsed)
}
