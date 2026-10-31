// 用 CDP 在真实 390×844 视口下截图，避免 Edge headless 的最小窗口宽度干扰
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9333
const BASE = 'http://127.0.0.1:5173'
const OUT = 'shots'
const profile = join(process.env.TEMP ?? '.', 'zhaomu-cdp-public')

mkdirSync(OUT, { recursive: true })

const browser = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  const res = await fetch(url)
  return res.json()
}

let target
for (let i = 0; i < 60; i += 1) {
  try {
    const list = await json(`http://127.0.0.1:${PORT}/json/list`)
    target =
      list.find((item) => item.type === 'page' && item.url === 'about:blank') ??
      list.find((item) => item.type === 'page')
    if (target) break
  } catch {
    /* 浏览器还没起来 */
  }
  await sleep(250)
}
if (!target) {
  browser.kill()
  throw new Error('没有找到可调试的页面')
}

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
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    console.log(
      'EXCEPTION',
      details.exception?.description ?? details.text ?? 'unknown',
    )
  }
  if (message.method === 'Log.entryAdded') {
    console.log('CONSOLE', message.params.entry.level, message.params.entry.text)
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
await send('Log.enable')
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true })

const routes = [
  ['home', '/'],
  ['timeline', '/timeline'],
  ['album', '/album'],
  ['mailbox', '/mailbox'],
  ['wishes', '/wishes'],
  ['settings', '/settings'],
]

await send('Network.clearBrowserCookies')
await send('Page.navigate', { url: `${BASE}/` })
await sleep(1200)

const loginShot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
})
writeFileSync(join(OUT, 'login.png'), Buffer.from(loginShot.data, 'base64'))

const loginResult = await send('Runtime.evaluate', {
  expression: `(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
      credentials: 'include',
    })
    return response.status
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
console.log('login', loginResult.result.value)

await send('Page.reload')
await sleep(1500)

for (const [name, path] of routes) {
  await send('Page.navigate', { url: BASE + path })
  await sleep(2200)
  const evaluated = await send('Runtime.evaluate', {
    expression:
      'JSON.stringify({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth })',
    returnByValue: true,
  })
  console.log(name, evaluated.result.value)
  if (name === 'home') {
    const rects = await send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.hero,.letter-card,.weather-grid')].map((el) => { const r = el.getBoundingClientRect(); return [el.className, Math.round(r.left), Math.round(r.right), Math.round(r.width)] }))`,
      returnByValue: true,
    })
    console.log('rects', rects.result.value)
  }
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))

  if (name === 'home') {
    const themes = ['sand', 'sage', 'pink', 'dai']
    for (const theme of themes) {
      await send('Runtime.evaluate', {
        expression: `document.documentElement.setAttribute('data-theme', '${theme}')`,
      })
      await sleep(500)
      const themed = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
      })
      writeFileSync(
        join(OUT, `home-${theme}.png`),
        Buffer.from(themed.data, 'base64'),
      )
    }

    await send('Runtime.evaluate', {
      expression: `document.documentElement.setAttribute('data-mode', 'dark')`,
    })
    for (const theme of themes) {
      await send('Runtime.evaluate', {
        expression: `document.documentElement.setAttribute('data-theme', '${theme}')`,
      })
      await sleep(500)
      const themed = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
      })
      writeFileSync(
        join(OUT, `home-${theme}-dark.png`),
        Buffer.from(themed.data, 'base64'),
      )
    }
    await send('Runtime.evaluate', {
      expression: `document.documentElement.removeAttribute('data-mode'); document.documentElement.removeAttribute('data-theme')`,
    })
  }

  if (name === 'settings') {
    const text = await send('Runtime.evaluate', {
      expression: `document.body.innerText`,
      returnByValue: true,
    })
    console.log('settings fresh', text.result.value.includes('私有桶'))

    const clicked = await send('Runtime.evaluate', {
      expression: `(() => {
        const button = [...document.querySelectorAll('.row-button')].find((item) => item.textContent.includes('我们的城市'))
        if (!button) return 'missing'
        button.click()
        return 'ok'
      })()`,
      returnByValue: true,
    })
    console.log('settings city click', clicked.result.value)
    await sleep(700)

    const cityShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, 'settings-cities.png'), Buffer.from(cityShot.data, 'base64'))

    await send('Runtime.evaluate', {
      expression: `document.querySelector('.sheet-close')?.click()`,
    })
    await sleep(300)

    await send('Runtime.evaluate', {
      expression: `(() => {
        const button = [...document.querySelectorAll('.row-button')].find((item) => item.textContent.includes('纪念日'))
        button?.click()
      })()`,
    })
    await sleep(600)
    const anniversaryShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(
      join(OUT, 'settings-anniversary.png'),
      Buffer.from(anniversaryShot.data, 'base64'),
    )
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.sheet-close')?.click()`,
    })
    await sleep(300)
  }

  if (name === 'mailbox') {
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.btn-primary')?.click()`,
    })
    await sleep(600)
    const voice = await send('Runtime.evaluate', {
      expression: `!!document.querySelector('.voice-box')`,
      returnByValue: true,
    })
    console.log('mailbox voice input', voice.result.value)
    const mailboxShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, 'mailbox-sheet.png'), Buffer.from(mailboxShot.data, 'base64'))
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.sheet-close')?.click()`,
    })
    await sleep(300)
  }

  if (name === 'timeline') {
    const seek = await send('Runtime.evaluate', {
      expression: `(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800))
        const player = document.querySelector('.voice-player')
        const audio = player?.querySelector('audio')
        const range = player?.querySelector('.voice-range')
        if (!audio || !range) return JSON.stringify({ player: false })
        range.value = '1.5'
        range.dispatchEvent(new Event('input', { bubbles: true }))
        range.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 900))
        return JSON.stringify({
          player: true,
          duration: audio.duration,
          current: audio.currentTime,
          value: range.value,
        })
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('voice seek', seek.result.value)
  }

  if (name === 'timeline' || name === 'album') {
    const fab = await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector('.fab'); if (!el) return 'missing'; const r = el.getBoundingClientRect(); return JSON.stringify({ label: el.getAttribute('aria-label'), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), position: getComputedStyle(el).position }) })()`,
      returnByValue: true,
    })
    console.log('fab', name, fab.result.value)
  }

  if (name === 'album') {
    const viewer = await send('Runtime.evaluate', {
      expression: `(async () => {
        const item = document.querySelector('.album-item')
        if (!item) return 'missing'
        item.click()
        await new Promise((resolve) => setTimeout(resolve, 500))
        return JSON.stringify({
          open: !!document.querySelector('.viewer'),
          count: document.querySelector('.viewer-count')?.textContent,
          src: document.querySelector('.viewer-img')?.getAttribute('src'),
        })
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('album viewer', viewer.result.value)

    const viewerShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, 'album-viewer.png'), Buffer.from(viewerShot.data, 'base64'))

    await send('Runtime.evaluate', {
      expression: `document.querySelector('.viewer-btn[aria-label="关闭"]')?.click()`,
    })
    await sleep(300)
  }

  if (name === 'album' && process.env.TEST_UPLOAD === '1') {
    const uploaded = await send('Runtime.evaluate', {
      expression: `(async () => {
        const response = await fetch('/photos/test-large.jpg')
        const blob = await response.blob()
        const file = new File([blob], 'test-large.jpg', { type: 'image/jpeg' })
        const transfer = new DataTransfer()
        transfer.items.add(file)
        const input = document.querySelector('input[type=file]')
        input.files = transfer.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 4000))
        const album = await fetch('/api/album').then((res) => res.json())
        const photo = album.photos[0]
        return JSON.stringify({
          count: document.querySelectorAll('.album-item').length,
          preview: Boolean(photo?.previewUrl?.includes('/preview')),
          bytes: blob.size,
        })
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('album upload', uploaded.result.value)

    const uploadShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, 'album-upload.png'), Buffer.from(uploadShot.data, 'base64'))
  }

  if (name === 'timeline') {
    const viewer = await send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.querySelector('.photo-btn')
        if (!button) return 'missing'
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 500))
        const result = {
          open: !!document.querySelector('.viewer'),
          count: document.querySelector('.viewer-count')?.textContent,
        }
        document.querySelector('.viewer-btn[aria-label="关闭"]')?.click()
        return JSON.stringify(result)
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('timeline viewer', viewer.result.value)
    await sleep(300)
  }

  if (name === 'timeline') {
    const state = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ app: !!document.querySelector('.app'), sheet: !!document.querySelector('.sheet'), root: document.getElementById('root')?.children.length })`,
      returnByValue: true,
    })
    console.log('before sheet', state.result.value)

    await send('Runtime.evaluate', {
      expression: `document.querySelector('.fab').click()`,
    })
    await sleep(600)
    const state2 = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ app: !!document.querySelector('.app'), sheet: !!document.querySelector('.sheet'), root: document.getElementById('root')?.children.length })`,
      returnByValue: true,
    })
    console.log('after sheet', state2.result.value)

    const sheetShot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, 'timeline-sheet.png'), Buffer.from(sheetShot.data, 'base64'))

    const attached = await send('Runtime.evaluate', {
      expression: `(async () => {
        const response = await fetch('/photos/p8.svg')
        const blob = await response.blob()
        const file = new File([blob], 'p8.svg', { type: 'image/svg+xml' })
        const transfer = new DataTransfer()
        transfer.items.add(file)
        const input = document.querySelector('.sheet input[type=file]')
        input.files = transfer.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 1600))
        return document.querySelectorAll('.compose-thumb').length
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('attached photos', attached.result.value)

    await send('Runtime.evaluate', {
      expression: `document.querySelector('.sheet-text').focus()`,
    })
    await send('Input.insertText', { text: '自动化测试：今天也很好。' })
    await sleep(300)
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.sheet .btn-primary').click()`,
    })
    await sleep(700)
    const saved = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ sheet: !!document.querySelector('.sheet'), first: document.querySelector('.entry-text')?.textContent, count: document.querySelectorAll('.entry').length, photos: document.querySelectorAll('.entry .photos img').length })`,
      returnByValue: true,
    })
    console.log('saved', saved.result.value)

    const cleanup = await send('Runtime.evaluate', {
      expression: `(async () => {
        const data = await fetch('/api/entries', { credentials: 'include' }).then((response) => response.json())
        const targets = data.entries.filter((entry) => entry.body.startsWith('自动化测试'))
        for (const entry of targets) {
          await fetch('/api/entries/' + entry.id, { method: 'DELETE', credentials: 'include' })
        }
        return targets.length
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    console.log('cleanup', cleanup.result.value)
  }
}

if (process.env.DARK_PAGES === '1') {
  for (const [name, path] of routes) {
    await send('Page.navigate', { url: BASE + path })
    await sleep(1100)

    if (name === 'settings') {
      await send('Runtime.evaluate', {
        expression: `[...document.querySelectorAll('.seg button')].find((el) => el.textContent.includes('深色')).click()`,
      })
      await sleep(450)
    } else {
      await send('Runtime.evaluate', {
        expression: `document.documentElement.setAttribute('data-mode', 'dark')`,
      })
      await sleep(450)
    }

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    writeFileSync(join(OUT, `${name}-dark.png`), Buffer.from(shot.data, 'base64'))
  }

  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('zhaomu-mode', 'light'); localStorage.setItem('zhaomu-theme', 'sand')`,
  })
}

await send('Page.navigate', { url: `${BASE}/` })
await sleep(350)
const cacheCheck = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ skeleton: !!document.querySelector('.home-skeleton'), city: document.querySelector('.weather-top span')?.textContent })`,
  returnByValue: true,
})
console.log('home cache', cacheCheck.result.value)

if (process.env.CHECK_MODE === '1') {
  await send('Page.navigate', { url: `${BASE}/settings` })
  await sleep(1300)

  const click = (selector, text) =>
    send('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('${selector}')].find((el) => el.textContent.includes('${text}')).click()`,
    })

  const read = async () => {
    const result = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ theme: document.documentElement.dataset.theme || null, mode: document.documentElement.dataset.mode || null, savedMode: localStorage.getItem('zhaomu-mode'), savedTheme: localStorage.getItem('zhaomu-theme') })`,
      returnByValue: true,
    })
    return result.result.value
  }

  await click('.theme', '青瓷')
  await sleep(350)
  console.log('theme ->', await read())

  await click('.seg button', '深色')
  await sleep(350)
  console.log('mode ->', await read())

  await send('Page.reload')
  await sleep(1400)
  console.log('reload ->', await read())

  await click('.seg button', '20:00 自动')
  await sleep(350)
  console.log('auto ->', await read())

  await click('.seg button', '浅色')
  await click('.theme', '暮砂')
  await sleep(350)
  console.log('reset ->', await read())
}

ws.close()
browser.kill()
console.log('done')
