import http, { ServerResponse } from 'node:http'
import httpProxy from 'http-proxy'
import { loadProxyConfig, validateProxyConfig } from './config.js'
import { resolveTarget } from './resolve-target.js'

const getPathname = (requestUrl = '/') => {
  try {
    return new URL(requestUrl, 'http://dev-proxy.invalid').pathname
  } catch {
    return '/'
  }
}

const writeBadGateway = (response, isWebSocket, error) => {
  if (!response) return
  if (isWebSocket) {
    if (!response.destroyed) {
      response.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      response.destroy()
    }
    return
  }
  if (response.headersSent) {
    response.destroy(error)
    return
  }
  response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Development proxy upstream is unavailable')
}

export const startDevProxy = async (configInput) => {
  const config = typeof configInput === 'string'
    ? await loadProxyConfig(configInput)
    : validateProxyConfig(configInput)

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    xfwd: true,
    ws: true,
    autoRewrite: true,
    protocolRewrite: 'http',
    cookieDomainRewrite: '',
  })

  proxy.on('error', (error, request, response) => {
    writeBadGateway(response, !(response instanceof ServerResponse), error)
  })

  const server = http.createServer((request, response) => {
    const { target } = resolveTarget(getPathname(request.url), config)
    proxy.web(request, response, { target })
  })

  server.on('upgrade', (request, socket, head) => {
    const { target } = resolveTarget(getPathname(request.url), config)
    proxy.ws(request, socket, head, { target })
  })

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error)
    server.once('error', onError)
    server.listen(config.listen.port, config.listen.host, () => {
      server.removeListener('error', onError)
      resolve()
    })
  })

  return {
    address: server.address(),
    config,
    close: () => new Promise((resolve, reject) => {
      proxy.close()
      server.close((error) => (error ? reject(error) : resolve()))
    }),
  }
}

export { resolveTarget }
