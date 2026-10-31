const BASE = 'http://127.0.0.1:8787'
let cookie = ''

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) }
  if (cookie) headers.cookie = cookie
  const response = await fetch(BASE + path, { ...init, headers })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) cookie = setCookie[0].split(';')[0]
  return response
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

const album = await (await request('/api/album')).json()
const photo = album.photos[0]
if (!photo) throw new Error('no photo')

const response = await request(`/media/${photo.id}?download=1`)
const bytes = await response.arrayBuffer()
console.log({
  status: response.status,
  disposition: response.headers.get('content-disposition'),
  type: response.headers.get('content-type'),
  bytes: bytes.byteLength,
})
