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
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text}`)
  }
  return data
}

async function upload(file, type) {
  const buffer = await readFile(join('public', 'photos', file))
  const form = new FormData()
  form.append('file', new Blob([buffer], { type }), file)
  return request('/api/media', { method: 'POST', body: form })
}

async function main() {
  const health = await request('/api/health')
  console.log('health', health.ok)

  const status = await request('/api/auth/status')
  console.log('needsSetup', status.needsSetup)

  if (status.needsSetup) {
    const setup = await request('/api/auth/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'zhaomu-setup',
        users: [
          { name: '小朝', email: 'a@zhaomu.local', password: 'test12345' },
          { name: '小暮', email: 'b@zhaomu.local', password: 'test12345' },
        ],
      }),
    })
    console.log('setup', setup.user.name, setup.user.email)
  } else {
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
    })
    console.log('login existing', login.user.name)
  }

  const photos = {}
  for (const name of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
    photos[name] = await upload(`${name}.svg`, 'image/svg+xml')
  }
  console.log('uploaded', Object.keys(photos).length)

  const currentSettings = await request('/api/settings')
  const nextMeeting = new Date(Date.now() + 12 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const savedSettings = await request('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      togetherSince: '2020-01-01',
      nextMeeting,
      birthdays: ['1998-01-01', '1998-01-02'],
      cities: currentSettings.settings.cities,
    }),
  })
  console.log(
    'settings',
    savedSettings.settings.nextMeeting,
    savedSettings.settings.cities.map((city) => city.name),
  )

  const anniversarySpecs = [
    { title: '第一次见面', date: '2020-01-01', recurring: true },
    { title: '第一次一起旅行', date: '2021-05-01', recurring: true },
  ]
  for (const anniversary of anniversarySpecs) {
    await request('/api/anniversaries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(anniversary),
    })
  }
  console.log('anniversaries', anniversarySpecs.length)

  const entries = [
    {
      text: '早上路过那家面包店，买了一个可颂。等你来的时候，我们再一起去。',
      mood: '☀️',
      weather: '晴 21°',
      location: '城市 A · 中心',
      mediaIds: [photos.p1.id],
    },
    {
      text: '今天下雨，窗外很安静。拍给你看。',
      mood: '🌧️',
      weather: '小雨 17°',
      location: '城市 B · 河边',
      mediaIds: [photos.p2.id, photos.p3.id],
    },
    {
      text: '今天有点累，但想到快见面了，又觉得还好。',
      mood: '🌙',
      private: true,
    },
    {
      text: '在超市看到你爱喝的酸奶，顺手拿了一排。',
      mood: '🌿',
      mediaIds: [photos.p4.id],
    },
    {
      text: '周末一起做饭，把厨房弄得一团糟，但很好吃。',
      mood: '🍲',
      mediaIds: [photos.p5.id, photos.p6.id, photos.p7.id],
    },
  ]

  for (const entry of entries) {
    const created = await request('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    })
    console.log('entry', created.entry.id.slice(0, 8), entry.text.slice(0, 12))
  }

  const standalone = await upload('p8.svg', 'image/svg+xml')
  console.log('standalone photo', standalone.id)

  const letter = await request('/api/letters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: '今天路过花店，看到一束很好看的花。等你来了，我们买一束放窗边。',
    }),
  })
  console.log('letter A unlockAt', letter.letter.unlockAt)

  const wishSpecs = [
    {
      title: '一起去海边看日出',
      note: '早起一次，带上热咖啡。',
      category: '旅行',
      targetDate: new Date(Date.now() + 120 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    },
    {
      title: '学会做一道她爱吃的菜',
      note: '先看一遍教程，再自己做三次。',
      category: '美食',
    },
    {
      title: '去一座没去过的城市吃遍小吃',
      note: '从街头吃到街尾，不许喊停。',
      category: '美食',
      targetDate: new Date(Date.now() + 12 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    },
    {
      title: '养一只猫',
      note: '等我们住在一起。',
      category: '生活',
    },
    {
      title: '一起跨年',
      note: '在江边倒数，然后走回住的地方。',
      category: '生活',
    },
  ]

  const createdWishes = []
  for (const wish of wishSpecs) {
    const result = await request('/api/wishes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wish),
    })
    createdWishes.push(result.wish)
  }

  const doneWish = await request(`/api/wishes/${createdWishes[4].id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ done: true }),
  })
  console.log('wishes', createdWishes.length, 'memory entry', Boolean(doneWish.wish.entryId))

  // 换成另一个人，验证私密记录和未解锁信件
  await request('/api/auth/logout', { method: 'POST' })
  const loginB = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'b@zhaomu.local', password: 'test12345' }),
  })
  console.log('login', loginB.user.name)

  const letterB = await request('/api/letters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '今天下雨了，出门记得带伞。' }),
  })
  console.log('letter B unlockAt', letterB.letter.unlockAt)

  const list = await request('/api/entries')
  const hasPrivate = list.entries.some((entry) => entry.private)
  console.log('B sees entries', list.entries.length, 'has private', hasPrivate)

  const letters = await request('/api/letters')
  console.log(
    'letters',
    letters.letters.map((item) => ({ mine: item.mine, locked: item.locked })),
  )

  const album = await request('/api/album')
  console.log('album photos', album.photos.length)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
