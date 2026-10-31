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
const id = album.photos[0]?.id
if (!id) throw new Error('no photos')

const full = await request(`/media/${id}`)
console.log('full', {
  status: full.status,
  length: full.headers.get('content-length'),
  ranges: full.headers.get('accept-ranges'),
})

const part = await request(`/media/${id}`, {
  headers: { Range: 'bytes=0-99' },
})
const bytes = await part.arrayBuffer()
console.log('range', {
  status: part.status,
  length: part.headers.get('content-length'),
  contentRange: part.headers.get('content-range'),
  bytes: bytes.byteLength,
})
