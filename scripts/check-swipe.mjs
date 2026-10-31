import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9335
const profile = join(process.env.TEMP ?? '.', 'zhaomu-swipe-profile')
mkdirSync(profile, { recursive: true })

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
    for (let i = 0; i < 20; i += 1) {
      if (document.querySelector('.album-item')) break
      await wait(200)
    }
    document.querySelector('.album-item')?.click()
    await wait(500)
    const stage = document.querySelector('.viewer-stage')
    if (!stage) return JSON.stringify({ viewer: false })
    const before = document.querySelector('.viewer-count')?.textContent
    const rect = stage.getBoundingClientRect()
    const y = rect.top + rect.height / 2
    const event = (type, x) =>
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      })
    stage.dispatchEvent(event('pointerdown', rect.left + rect.width * 0.8))
    stage.dispatchEvent(event('pointermove', rect.left + rect.width * 0.68))
    stage.dispatchEvent(event('pointermove', rect.left + rect.width * 0.55))
    stage.dispatchEvent(event('pointermove', rect.left + rect.width * 0.4))
    await wait(150)
    stage.dispatchEvent(event('pointerup', rect.left + rect.width * 0.4))
    await wait(500)
    return JSON.stringify({
      viewer: true,
      before,
      after: document.querySelector('.viewer-count')?.textContent,
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
})
console.log(result.result.value)

ws.close()
browser.kill()
