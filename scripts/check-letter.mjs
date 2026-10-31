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

const before = await request('/api/letters')
const partnerLetter = before.letters.find(
  (letter) => !letter.mine && !letter.locked,
)
console.log('unlocked partner letter', Boolean(partnerLetter), partnerLetter?.readAt)

if (partnerLetter) {
  const read = await request(`/api/letters/${partnerLetter.id}/read`, {
    method: 'PATCH',
  })
  console.log('marked read', read.readAt)
  const after = await request('/api/letters')
  const same = after.letters.find((letter) => letter.id === partnerLetter.id)
  console.log('persisted readAt', Boolean(same?.readAt))
}
