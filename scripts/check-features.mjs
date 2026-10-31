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
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text}`)
  return data
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

// 自定义纪念日
const anniversary = await request('/api/anniversaries', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: '接口测试纪念日',
    date: '2023-05-20',
    recurring: true,
  }),
})
const listAfterAdd = await request('/api/anniversaries')
await request(`/api/anniversaries/${anniversary.anniversary.id}`, {
  method: 'DELETE',
})
const listAfterDelete = await request('/api/anniversaries')
console.log('anniversary', {
  added: listAfterAdd.anniversaries.length,
  removed: listAfterDelete.anniversaries.length,
})

// 独立照片删除
const buffer = await readFile(join('public', 'photos', 'p8.svg'))
const form = new FormData()
form.append('file', new Blob([buffer], { type: 'image/svg+xml' }), 'p8.svg')
const media = await request('/api/media', { method: 'POST', body: form })
const albumAfterUpload = await request('/api/album')
const uploaded = albumAfterUpload.photos.find((photo) => photo.id === media.id)
console.log('standalone', uploaded?.standalone, uploaded?.mine)
await request(`/api/media/${media.id}`, { method: 'DELETE' })
const albumAfterDelete = await request('/api/album')
console.log('album', albumAfterUpload.photos.length, albumAfterDelete.photos.length)

// 愿望编辑 + 撤回
const created = await request('/api/wishes', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: '接口测试愿望', note: '旧备注', category: '体验' }),
})
const edited = await request(`/api/wishes/${created.wish.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: '接口测试愿望（改）', note: '新备注' }),
})
const completed = await request(`/api/wishes/${created.wish.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ done: true }),
})
const undone = await request(`/api/wishes/${created.wish.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ done: false }),
})
console.log('wish', {
  title: edited.wish.title,
  note: edited.wish.note,
  completed: completed.wish.done,
  undone: undone.wish.done,
})

if (completed.wish.entryId) {
  await request(`/api/entries/${completed.wish.entryId}`, { method: 'DELETE' })
}
await request(`/api/wishes/${created.wish.id}`, { method: 'DELETE' })
console.log('wish cleaned')
