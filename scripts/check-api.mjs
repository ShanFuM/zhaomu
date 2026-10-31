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
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text}`)
  return data
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

const settings = await request('/api/settings')
console.log('settings', settings.settings.cities.map((city) => city.name))

const weather = await request('/api/weather')
console.log(
  'weather',
  weather.cities.map((city) => ({
    name: city.name,
    temp: city.temp,
    label: city.label,
    high: city.high,
    low: city.low,
  })),
  weather.distanceKm,
)

const geocode = await request('/api/geocode?q=杭州')
console.log('geocode', geocode.results.slice(0, 2))

const storage = await request('/api/storage')
console.log('storage', storage)

const exported = await request('/api/export')
console.log('export', {
  entries: exported.entries.length,
  letters: exported.letters.length,
  media: exported.media.length,
})

const createdWish = await request('/api/wishes', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: '接口测试愿望',
    note: '完成后应该生成一条时间轴',
    category: '体验',
  }),
})
const completedWish = await request(`/api/wishes/${createdWish.wish.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ done: true }),
})
console.log('wish complete', completedWish.wish.done, Boolean(completedWish.wish.entryId))

if (completedWish.wish.entryId) {
  await request(`/api/entries/${completedWish.wish.entryId}`, { method: 'DELETE' })
}
await request(`/api/wishes/${createdWish.wish.id}`, { method: 'DELETE' })
console.log('wish cleaned')

const nudgeBefore = await request('/api/nudges')
await request('/api/nudges', { method: 'POST' })
const nudgeAfter = await request('/api/nudges')
console.log('nudge', nudgeBefore, nudgeAfter)
