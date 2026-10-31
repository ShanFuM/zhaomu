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
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text}`)
  return data
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

const form = new FormData()
form.append(
  'file',
  new Blob([Buffer.from('fake audio bytes for testing')], {
    type: 'audio/webm',
  }),
  'voice.webm',
)
const media = await request('/api/media', { method: 'POST', body: form })
const created = await request('/api/letters', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: '', voiceId: media.id }),
})
console.log('created', {
  body: created.letter.body,
  voice: Boolean(created.letter.voice),
})

const list = await request('/api/letters')
const found = list.letters.find((letter) => letter.id === created.letter.id)
console.log('listed', { body: found.body, voice: Boolean(found.voice) })
