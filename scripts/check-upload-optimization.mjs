import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9337
const profile = join(process.env.TEMP ?? '.', 'zhaomu-upload-profile')
mkdirSync(profile, { recursive: true })

const browser = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
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
    target =
      list.find((item) => item.type === 'page' && item.url === 'about:blank') ??
      list.find((item) => item.type === 'page')
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
await send('Network.setCacheDisabled', { cacheDisabled: true })
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
    const input = document.querySelector('input[type=file]')
    const response = await fetch('/photos/large-test.jpg')
    const blob = await response.blob()
    const file = new File([blob], 'large-test.jpg', { type: 'image/jpeg' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(12000)

    const album = await fetch('/api/album').then((res) => res.json())
    const photo = album.photos[0]
    const inspect = async (url) => {
      if (!url) return null
      const res = await fetch(url)
      const data = await res.blob()
      return { status: res.status, size: data.size, type: data.type }
    }

    return JSON.stringify({
      count: album.photos.length,
      photo: photo
        ? {
            url: photo.url,
            previewUrl: photo.previewUrl,
            thumbUrl: photo.thumbUrl,
            standalone: photo.standalone,
          }
        : null,
      original: photo ? await inspect(photo.url) : null,
      preview: photo ? await inspect(photo.previewUrl) : null,
      thumb: photo ? await inspect(photo.thumbUrl) : null,
      error: document.querySelector('.auth-error')?.textContent ?? null,
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
})
console.log(result.result.value)

ws.close()
browser.kill()
