import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 8102

const server = createServer((request, response) => {
  if (request.url === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ ok: true, source: 'local fallback host' }))
    return
  }

  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local fallback host</title>
  <body>
    <h1>Local fallback host</h1>
    <p>This page is served by the fallback target through the development proxy.</p>
    <p><a href="/demo/">Open the Vite sub-application</a></p>
    <p>Health endpoint: <a href="/api/health">/api/health</a></p>
  </body>
</html>`)
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
})

server.listen(port, host, () => {
  console.log(`Local fallback host listening on http://${host}:${port}`)
})
