// Read-only smart-HTTP git server (git http-backend as CGI) on 127.0.0.1: CC rejects file:// marketplace URLs.
// Usage: node githttp.mjs <project-root> <port-file>; writes the bound port, serves until killed.
import http from 'node:http'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const [root, portFile] = process.argv.slice(2)
if (!root || !portFile) {
  process.stderr.write('usage: node githttp.mjs <project-root> <port-file>\n')
  process.exit(2)
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1')
  const env = {
    PATH: process.env.PATH,
    GIT_PROJECT_ROOT: root,
    GIT_HTTP_EXPORT_ALL: '1',
    REQUEST_METHOD: req.method,
    PATH_INFO: decodeURIComponent(u.pathname),
    QUERY_STRING: u.search.slice(1),
    CONTENT_TYPE: req.headers['content-type'] ?? '',
    REMOTE_ADDR: '127.0.0.1',
    HTTP_CONTENT_ENCODING: req.headers['content-encoding'] ?? '',
    GIT_PROTOCOL: req.headers['git-protocol'] ?? '',
  }
  const cgi = spawn('git', ['http-backend'], { env })
  req.pipe(cgi.stdin)
  let head = Buffer.alloc(0)
  let sent = false
  cgi.stdout.on('data', (chunk) => {
    if (sent) return void res.write(chunk)
    head = Buffer.concat([head, chunk])
    const at = head.indexOf('\r\n\r\n')
    if (at < 0) return
    let status = 200
    for (const line of head.slice(0, at).toString('latin1').split('\r\n')) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      if (k.toLowerCase() === 'status') status = Number(v.split(' ')[0]) || 200
      else res.setHeader(k, v)
    }
    res.writeHead(status)
    sent = true
    res.write(head.slice(at + 4))
  })
  cgi.stderr.on('data', (d) => process.stderr.write(d))
  cgi.on('close', () => {
    if (!sent) res.writeHead(500)
    res.end()
  })
})

server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(portFile, `${server.address().port}\n`)
})
