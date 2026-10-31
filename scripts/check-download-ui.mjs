import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9336
const profile = join(process.env.TEMP ?? '.', 'zhaomu-download-profile')
const downloadDir = join(
  process.env.TEMP ?? '.',
  `zhaomu-download-${Date.now()}`,
)
mkdirSync(profile, { recursive: true })
mkdirSync(downloadDir, { recursive: true })

const browser = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let target
for (let i = 0; i < 60; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((item) => item.type === 'page')
    if (target) break
  } catch {
    /* wait */
  }
  await sleep(250)
}
if (!target) throw new Error('no target')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let nextId = 1
const pending = new Map()
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
}

function send(method, params = {}) {
  const id = nextId
  nextId += 1
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: downloadDir,
})
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
})

await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await sleep(1000)
await send('Runtime.evaluate', {
  expression: `(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
    });
    if (!response.ok) return 'login-' + response.status;
    location.href = '/album';
    return 'ok';
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
await sleep(1800)

const result = await send('Runtime.evaluate', {
  expression: `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    for (let i = 0; i < 20; i += 1) {
      if (document.querySelector('.album-item')) break
      await wait(200)
    }
    document.querySelector('.album-item')?.click()
    await wait(500)
    const before = location.href
    const button = document.querySelector('button[aria-label="下载原图"]')
    button?.click()
    await wait(2200)
    return JSON.stringify({
      button: Boolean(button),
      before,
      after: location.href,
      error: document.querySelector('.viewer-toast')?.textContent ?? null,
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
})
console.log(result.result.value)

await sleep(1000)
const files = readdirSync(downloadDir).map((name) => ({
  name,
  size: statSync(join(downloadDir, name)).size,
}))
console.log('downloads', files)

ws.close()
browser.kill()
