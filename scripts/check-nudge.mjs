const BASE = 'http://127.0.0.1:8787'
let cookie = ''

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) }
  if (cookie) headers.cookie = cookie
  const response = await fetch(BASE + path, { ...init, headers })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) cookie = setCookie[0].split(';')[0]
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: response.status, data }
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

console.log('before', (await request('/api/nudges')).data)

for (let i = 1; i <= 6; i += 1) {
  const started = performance.now()
  const result = await request('/api/nudges', { method: 'POST' })
  console.log('send', i, result.status, result.data, `${Math.round(performance.now() - started)}ms`)
}

console.log('after', (await request('/api/nudges')).data)
