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
  return response
}

await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'a@zhaomu.local', password: 'test12345' }),
})

const original = await readFile(join('public', 'photos', 'test-large.jpg'))
const preview = await readFile(join('shots', 'test-preview.jpg'))

const form = new FormData()
form.append('file', new Blob([original], { type: 'image/jpeg' }), 'large.jpg')
form.append('preview', new Blob([preview], { type: 'image/jpeg' }), 'preview.jpg')
form.append('keepOriginal', '1')

const uploadResponse = await request('/api/media', { method: 'POST', body: form })
const media = await uploadResponse.json()
console.log('upload', {
  hasPreview: media.hasPreview,
  previewUrl: media.previewUrl,
  size: original.length,
  previewSize: preview.length,
})

const previewResponse = await request(media.previewUrl)
console.log('preview fetch', previewResponse.status, previewResponse.headers.get('content-type'))

const album = await (await request('/api/album')).json()
const photo = album.photos.find((item) => item.id === media.id)
console.log('album', {
  previewUrl: photo?.previewUrl,
  standalone: photo?.standalone,
})

const deleteResponse = await request(`/api/media/${media.id}`, { method: 'DELETE' })
console.log('delete', deleteResponse.status)
