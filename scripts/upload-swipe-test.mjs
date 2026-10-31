import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:8787'
let cookie = ''

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) }
  if (cookie) headers.cookie = cookie
  const response = await fetch(BASE + path, { ...init, headers })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) cookie = setCookie[0].split(';')[0]
  const text = await response.text()
  const data = JSON.parse(text)
  if (!response.ok) throw new Error(`${path} ${response.status} ${text}`)
  return data
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

for (let i = 1; i <= 3; i += 1) {
  const buffer = await readFile(join(process.env.TEMP ?? '', `swipe-${i}.jpg`))
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), `swipe-${i}.jpg`)
  const media = await request('/api/media', { method: 'POST', body: form })
  console.log('uploaded', i, media.id)
}
