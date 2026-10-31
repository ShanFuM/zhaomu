import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9334
const profile = join(process.env.TEMP ?? '.', 'zhaomu-voice-profile')
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
await sleep(1200)
await send('Runtime.evaluate', {
  expression: `(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
    });
    if (!response.ok) return 'login-' + response.status;
    location.href = '/timeline';
    return 'ok';
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
await sleep(2500)

const result = await send('Runtime.evaluate', {
  expression: `(async () => {
    for (let i = 0; i < 20; i += 1) {
      if (document.querySelector('.voice-range')) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const player = document.querySelector('.voice-player')
    const range = document.querySelector('.voice-range')
    const times = [...document.querySelectorAll('.voice-time')].map((node) => node.textContent)
    if (!player) return JSON.stringify({ player: false, body: document.body.innerText.slice(0, 120) })
    if (!range) return JSON.stringify({ player: true, fallback: true, times })
    if (range.disabled) return JSON.stringify({ player: true, disabled: true, times })
    const rect = range.getBoundingClientRect()
    const x1 = rect.left + rect.width * 0.2
    const x2 = rect.left + rect.width * 0.8
    const y = rect.top + rect.height / 2
    const pointer = (type, x) =>
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      })
    range.dispatchEvent(pointer('pointerdown', x1))
    range.dispatchEvent(pointer('pointermove', x2))
    await new Promise((resolve) => setTimeout(resolve, 300))
    const during = [...document.querySelectorAll('.voice-time')].map((node) => node.textContent)
    range.dispatchEvent(pointer('pointerup', x2))
    await new Promise((resolve) => setTimeout(resolve, 200))
    return JSON.stringify({
      player: true,
      disabled: range.disabled,
      max: range.max,
      during,
      after: [...document.querySelectorAll('.voice-time')].map((node) => node.textContent),
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
})
console.log(result.result.value)

ws.close()
browser.kill()
