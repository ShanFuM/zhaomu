const BASE = 'http://127.0.0.1:8787'
let cookie = ''

async function request(path) {
  const response = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
  })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) cookie = setCookie[0].split(';')[0]
  if (!response.ok) throw new Error(`${path} -> ${response.status}`)
  return response.json()
}

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})
cookie = login.headers.getSetCookie()[0].split(';')[0]

const [entries, letters, album, wishes, nudges, storage] = await Promise.all([
  request('/api/entries'),
  request('/api/letters'),
  request('/api/album'),
  request('/api/wishes'),
  request('/api/nudges'),
  request('/api/storage'),
])

console.log({
  entries: entries.entries.length,
  letters: letters.letters.length,
  photos: album.photos.length,
  wishes: wishes.wishes.length,
  nudges,
  storage,
})
