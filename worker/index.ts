import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'

interface Bindings {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  SETUP_CODE: string
  APP_ENV: string
}

interface SessionUser {
  id: string
  name: string
  email: string
}

type AppEnv = {
  Bindings: Bindings
  Variables: { user: SessionUser }
}

interface EntryRow {
  id: string
  user_id: string
  author_name: string
  body: string
  mood: string | null
  weather: string | null
  location: string | null
  is_private: number
  created_at: string
  media_id: string | null
  media_kind: string | null
  media_mime: string | null
  media_has_preview: number | null
  media_has_thumb: number | null
}

interface SettingsRow {
  together_since: string
  next_meeting: string | null
  city_a_name: string
  city_a_lat: number
  city_a_lon: number
  city_b_name: string
  city_b_lat: number
  city_b_lon: number
  birthday_a: string | null
  birthday_b: string | null
  updated_at: string
}

interface WishRow {
  id: string
  user_id: string
  author_name: string
  title: string
  note: string | null
  category: string
  target_date: string | null
  done: number
  done_at: string | null
  entry_id: string | null
  created_at: string
}

function wishDto(row: WishRow) {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    category: row.category,
    targetDate: row.target_date,
    done: row.done === 1,
    doneAt: row.done_at,
    entryId: row.entry_id,
    createdAt: row.created_at,
    author: { id: row.user_id, name: row.author_name },
  }
}

async function getWish(env: Bindings, id: string) {
  return env.DB.prepare(
    `SELECT w.*, u.name AS author_name
     FROM wishes w JOIN users u ON u.id = w.user_id
     WHERE w.id = ?`,
  )
    .bind(id)
    .first<WishRow>()
}

const app = new Hono<AppEnv>()

const SESSION_COOKIE = 'zm_session'
const SESSION_DAYS = 30
const PBKDF2_ITERATIONS = 100_000

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2)
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return out
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return toHex(new Uint8Array(digest))
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'pbkdf2' || !saltHex || !hashHex) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromHex(saltHex),
      iterations: Number(iterations),
    },
    key,
    256,
  )
  return safeEqual(toHex(new Uint8Array(bits)), hashHex)
}

function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken()
  const id = await sha256Hex(token)
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000)

  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, expires.toISOString(), now.toISOString())
    .run()

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
    secure: new URL(c.req.url).protocol === 'https:',
  })
}

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const id = await sha256Hex(token)
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<SessionUser & { expires_at: string }>()

  if (!row) return c.json({ error: 'unauthorized' }, 401)

  if (Date.parse(row.expires_at) < Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ error: 'unauthorized' }, 401)
  }

  c.set('user', { id: row.id, name: row.name, email: row.email })
  await next()
}

function letterUnlockAt(created: Date) {
  const shanghai = new Date(created.getTime() + 8 * 3_600_000)
  const year = shanghai.getUTCFullYear()
  const month = shanghai.getUTCMonth()
  const day = shanghai.getUTCDate()
  const unlock = new Date(Date.UTC(year, month, day, 15, 0, 0))

  return unlock.getTime() <= created.getTime()
    ? created.toISOString()
    : unlock.toISOString()
}

function shanghaiDayStartIso() {
  const shanghai = new Date(Date.now() + 8 * 3_600_000)
  const start =
    Date.UTC(
      shanghai.getUTCFullYear(),
      shanghai.getUTCMonth(),
      shanghai.getUTCDate(),
    ) - 8 * 3_600_000
  return new Date(start).toISOString()
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function getSettingsRow(env: Bindings) {
  const row = await env.DB.prepare(
    'SELECT * FROM couple_settings WHERE id = 1',
  ).first<SettingsRow>()

  if (!row) throw new Error('settings_missing')
  return row
}

function settingsDto(row: SettingsRow) {
  return {
    togetherSince: row.together_since,
    nextMeeting: row.next_meeting,
    birthdays: [row.birthday_a, row.birthday_b],
    cities: [
      { name: row.city_a_name, lat: row.city_a_lat, lon: row.city_a_lon },
      { name: row.city_b_name, lat: row.city_b_lat, lon: row.city_b_lon },
    ],
    updatedAt: row.updated_at,
  }
}

function weatherInfo(code: number): { label: string; kind: string } {
  if (code === 0) return { label: '晴', kind: 'sun' }
  if (code === 1) return { label: '大部晴朗', kind: 'sun' }
  if (code === 2) return { label: '多云', kind: 'cloud' }
  if (code === 3) return { label: '阴', kind: 'cloud' }
  if (code === 45 || code === 48) return { label: '雾', kind: 'cloud' }
  if (code >= 51 && code <= 57) return { label: '毛毛雨', kind: 'rain' }
  if (code >= 61 && code <= 67) return { label: '雨', kind: 'rain' }
  if (code >= 71 && code <= 77) return { label: '雪', kind: 'snow' }
  if (code >= 80 && code <= 82) return { label: '阵雨', kind: 'rain' }
  if (code >= 85 && code <= 86) return { label: '阵雪', kind: 'snow' }
  if (code >= 95) return { label: '雷雨', kind: 'rain' }
  return { label: '多云', kind: 'cloud' }
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weather_code: number
    wind_speed_10m: number
  }
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    sunrise: string[]
    sunset: string[]
  }
}

async function fetchCityWeather(city: {
  name: string
  lat: number
  lon: number
}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(city.lat))
  url.searchParams.set('longitude', String(city.lon))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
  )
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,sunrise,sunset',
  )
  url.searchParams.set('timezone', 'Asia/Shanghai')
  url.searchParams.set('forecast_days', '1')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`weather_${response.status}`)

  const data = await response.json<OpenMeteoResponse>()
  const info = weatherInfo(data.current.weather_code)

  return {
    name: city.name,
    lat: city.lat,
    lon: city.lon,
    temp: Math.round(data.current.temperature_2m),
    feels: Math.round(data.current.apparent_temperature),
    humidity: Math.round(data.current.relative_humidity_2m),
    wind: Math.round(data.current.wind_speed_10m),
    high: Math.round(data.daily.temperature_2m_max[0] ?? 0),
    low: Math.round(data.daily.temperature_2m_min[0] ?? 0),
    sunrise: data.daily.sunrise[0] ?? null,
    sunset: data.daily.sunset[0] ?? null,
    label: info.label,
    kind: info.kind,
    code: data.current.weather_code,
  }
}

function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const R = 6371
  const rad = (value: number) => (value * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/* ---------- public ---------- */

app.get('/api/health', (c) =>
  c.json({ ok: true, time: new Date().toISOString() }),
)

app.get('/api/auth/status', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{
    n: number
  }>()
  return c.json({ needsSetup: (row?.n ?? 0) === 0 })
})

app.post('/api/auth/setup', async (c) => {
  const body = await c.req
    .json<{
      code?: string
      users?: { name?: string; email?: string; password?: string }[]
    }>()
    .catch(() => null)

  if (!body) return c.json({ error: 'invalid_body' }, 400)
  if (!safeEqual(body.code ?? '', c.env.SETUP_CODE ?? 'zhaomu-setup')) {
    return c.json({ error: 'invalid_setup_code' }, 403)
  }

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{
    n: number
  }>()
  if ((count?.n ?? 0) > 0) return c.json({ error: 'already_setup' }, 409)

  const users = body.users ?? []
  if (users.length !== 2) return c.json({ error: 'need_two_users' }, 400)

  const normalized = users.map((user) => ({
    name: (user.name ?? '').trim(),
    email: (user.email ?? '').trim().toLowerCase(),
    password: user.password ?? '',
  }))

  for (const user of normalized) {
    if (!user.name || user.name.length > 20) {
      return c.json({ error: 'invalid_name' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      return c.json({ error: 'invalid_email' }, 400)
    }
    if (user.password.length < 8) {
      return c.json({ error: 'weak_password' }, 400)
    }
  }

  if (new Set(normalized.map((user) => user.email)).size !== 2) {
    return c.json({ error: 'duplicate_email' }, 400)
  }

  const prepared = await Promise.all(
    normalized.map(async (user) => {
      const id = crypto.randomUUID()
      const hash = await hashPassword(user.password)
      return {
        id,
        name: user.name,
        email: user.email,
        statement: c.env.DB.prepare(
          'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(id, user.name, user.email, hash, new Date().toISOString()),
      }
    }),
  )

  await c.env.DB.batch(prepared.map((item) => item.statement))
  await createSession(c, prepared[0].id)

  return c.json({
    user: {
      id: prepared[0].id,
      name: prepared[0].name,
      email: prepared[0].email,
    },
  })
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch(() => null)
  if (!body) return c.json({ error: 'invalid_body' }, 400)

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  if (!email || !password) return c.json({ error: 'invalid_credentials' }, 401)

  const row = await c.env.DB.prepare(
    'SELECT id, name, email, password_hash FROM users WHERE email = ?',
  )
    .bind(email)
    .first<SessionUser & { password_hash: string }>()

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  await createSession(c, row.id)
  return c.json({ user: { id: row.id, name: row.name, email: row.email } })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    const id = await sha256Hex(token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/* ---------- protected ---------- */

app.use('/api/*', requireAuth)
app.use('/media/*', requireAuth)

app.get('/api/me', (c) => c.json({ user: c.get('user') }))

app.get('/api/entries', async (c) => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.user_id, u.name AS author_name, e.body, e.mood, e.weather,
            e.location, e.is_private, e.created_at,
            m.id AS media_id, m.kind AS media_kind, m.mime AS media_mime,
            m.has_preview AS media_has_preview,
            m.has_thumb AS media_has_thumb
     FROM entries e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN media m ON m.entry_id = e.id
     WHERE e.is_private = 0 OR e.user_id = ?
     ORDER BY e.created_at DESC, m.created_at ASC`,
  )
    .bind(user.id)
    .all<EntryRow>()

  const map = new Map<string, Record<string, unknown>>()

  for (const row of rows.results) {
    let entry = map.get(row.id)
    if (!entry) {
      entry = {
        id: row.id,
        body: row.body,
        mood: row.mood,
        weather: row.weather,
        location: row.location,
        private: row.is_private === 1,
        createdAt: row.created_at,
        author: { id: row.user_id, name: row.author_name },
        media: [],
      }
      map.set(row.id, entry)
    }

    if (row.media_id) {
      const previewUrl = row.media_has_preview
        ? `/media/${row.media_id}/preview`
        : `/media/${row.media_id}`
      ;(entry.media as {
        id: string
        kind: string
        mime: string
        previewUrl: string
        thumbUrl: string
      }[]).push({
        id: row.media_id,
        kind: row.media_kind ?? 'image',
        mime: row.media_mime ?? 'application/octet-stream',
        previewUrl,
        thumbUrl: row.media_has_thumb
          ? `/media/${row.media_id}/thumb`
          : previewUrl,
      })
    }
  }

  return c.json({ entries: [...map.values()] })
})

app.post('/api/entries', async (c) => {
  const user = c.get('user')
  const body = await c.req
    .json<{
      text?: string
      mood?: string
      weather?: string
      location?: string
      private?: boolean
      mediaIds?: string[]
    }>()
    .catch(() => null)

  const text = (body?.text ?? '').trim()
  if (!text || text.length > 5000) {
    return c.json({ error: 'invalid_text' }, 400)
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const isPrivate = body?.private ? 1 : 0

  await c.env.DB.prepare(
    `INSERT INTO entries (id, user_id, body, mood, weather, location, is_private, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      text,
      body?.mood ?? null,
      body?.weather ?? null,
      body?.location ?? null,
      isPrivate,
      createdAt,
    )
    .run()

  const mediaIds = (body?.mediaIds ?? [])
    .filter((value): value is string => typeof value === 'string')
    .slice(0, 9)

  if (mediaIds.length > 0) {
    const placeholders = mediaIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE media SET entry_id = ?
       WHERE id IN (${placeholders}) AND user_id = ? AND entry_id IS NULL`,
    )
      .bind(id, ...mediaIds, user.id)
      .run()
  }

  return c.json(
    {
      entry: {
        id,
        body: text,
        mood: body?.mood ?? null,
        weather: body?.weather ?? null,
        location: body?.location ?? null,
        private: Boolean(body?.private),
        createdAt,
        author: { id: user.id, name: user.name },
        media: [],
      },
    },
    201,
  )
})

app.post('/api/media', async (c) => {
  const user = c.get('user')
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) return c.json({ error: 'missing_file' }, 400)
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'too_large' }, 413)

  const kind = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('audio/')
      ? 'audio'
      : null

  if (!kind) return c.json({ error: 'unsupported_type' }, 415)
  if (
    file.type === 'image/svg+xml' &&
    c.env.APP_ENV !== 'development'
  ) {
    return c.json({ error: 'unsupported_type' }, 415)
  }

  const previewValue = form?.get('preview')
  const previewFile =
    kind === 'image' &&
    previewValue instanceof File &&
    previewValue.type.startsWith('image/') &&
    previewValue.size <= 8 * 1024 * 1024
      ? previewValue
      : null

  const thumbValue = form?.get('thumb')
  const thumbFile =
    kind === 'image' &&
    thumbValue instanceof File &&
    thumbValue.type.startsWith('image/') &&
    thumbValue.size <= 4 * 1024 * 1024
      ? thumbValue
      : null

  const keepOriginal = (form?.get('keepOriginal') ?? '1') !== '0'
  const previewOnly = Boolean(previewFile && !keepOriginal)
  const mainFile = previewOnly && previewFile ? previewFile : file
  const hasPreview = Boolean(previewFile && keepOriginal)
  const hasThumb = Boolean(thumbFile)

  const id = crypto.randomUUID()
  await c.env.BUCKET.put(`media/${id}`, mainFile.stream(), {
    httpMetadata: { contentType: mainFile.type },
  })

  if (hasPreview && previewFile) {
    await c.env.BUCKET.put(`media/${id}/preview`, previewFile.stream(), {
      httpMetadata: { contentType: previewFile.type },
    })
  }

  if (hasThumb && thumbFile) {
    await c.env.BUCKET.put(`media/${id}/thumb`, thumbFile.stream(), {
      httpMetadata: { contentType: thumbFile.type },
    })
  }

  await c.env.DB.prepare(
    `INSERT INTO media (
       id, user_id, entry_id, kind, mime, size,
       has_preview, preview_mime, preview_size,
       has_thumb, thumb_mime, thumb_size, created_at
     )
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      kind,
      mainFile.type,
      mainFile.size,
      hasPreview ? 1 : 0,
      hasPreview && previewFile ? previewFile.type : null,
      hasPreview && previewFile ? previewFile.size : null,
      hasThumb ? 1 : 0,
      hasThumb && thumbFile ? thumbFile.type : null,
      hasThumb && thumbFile ? thumbFile.size : null,
      new Date().toISOString(),
    )
    .run()

  return c.json(
    {
      id,
      url: `/media/${id}`,
      previewUrl: hasPreview ? `/media/${id}/preview` : `/media/${id}`,
      thumbUrl: hasThumb ? `/media/${id}/thumb` : `/media/${id}`,
      mime: mainFile.type,
      kind,
      hasPreview,
      hasThumb,
    },
    201,
  )
})

app.patch('/api/media/:id/thumb', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const form = await c.req.formData().catch(() => null)
  const thumb = form?.get('thumb')

  if (!(thumb instanceof File)) return c.json({ error: 'missing_thumb' }, 400)
  if (!thumb.type.startsWith('image/')) {
    return c.json({ error: 'unsupported_type' }, 415)
  }
  if (thumb.size > 4 * 1024 * 1024) {
    return c.json({ error: 'too_large' }, 413)
  }

  const media = await c.env.DB.prepare(
    'SELECT user_id, kind FROM media WHERE id = ?',
  )
    .bind(id)
    .first<{ user_id: string; kind: string }>()

  if (!media) return c.json({ error: 'not_found' }, 404)
  if (media.user_id !== user.id) return c.json({ error: 'forbidden' }, 403)
  if (media.kind !== 'image') return c.json({ error: 'not_image' }, 400)

  await c.env.BUCKET.put(`media/${id}/thumb`, thumb.stream(), {
    httpMetadata: { contentType: thumb.type },
  })

  await c.env.DB.prepare(
    `UPDATE media
     SET has_thumb = 1, thumb_mime = ?, thumb_size = ?
     WHERE id = ?`,
  )
    .bind(thumb.type, thumb.size, id)
    .run()

  return c.json({ thumbUrl: `/media/${id}/thumb`, hasThumb: true })
})

app.get('/api/album', async (c) => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.mime, m.kind, m.user_id, m.entry_id,
            m.has_preview, m.has_thumb,
            COALESCE(e.created_at, m.created_at) AS taken_at
     FROM media m
     LEFT JOIN entries e ON e.id = m.entry_id
     WHERE m.kind = 'image'
       AND (m.entry_id IS NULL OR e.is_private = 0 OR e.user_id = ?)
     ORDER BY taken_at DESC
     LIMIT 200`,
  )
    .bind(user.id)
    .all<{
      id: string
      mime: string
      kind: string
      user_id: string
      entry_id: string | null
      has_preview: number
      has_thumb: number
      taken_at: string
    }>()

  return c.json({
    photos: rows.results.map((row) => {
      const previewUrl = row.has_preview
        ? `/media/${row.id}/preview`
        : `/media/${row.id}`
      return {
        id: row.id,
        url: `/media/${row.id}`,
        previewUrl,
        thumbUrl: row.has_thumb ? `/media/${row.id}/thumb` : previewUrl,
        hasThumb: row.has_thumb === 1,
        mime: row.mime,
        takenAt: row.taken_at,
        standalone: row.entry_id === null,
        mine: row.user_id === user.id,
      }
    }),
  })
})

app.delete('/api/media/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const media = await c.env.DB.prepare(
    'SELECT user_id, entry_id FROM media WHERE id = ?',
  )
    .bind(id)
    .first<{ user_id: string; entry_id: string | null }>()

  if (!media) return c.json({ error: 'not_found' }, 404)
  if (media.user_id !== user.id) {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (media.entry_id) {
    return c.json({ error: 'attached_to_entry' }, 409)
  }

  await c.env.BUCKET.delete([
    `media/${id}`,
    `media/${id}/preview`,
    `media/${id}/thumb`,
  ])
  await c.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

app.delete('/api/entries/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const entry = await c.env.DB.prepare(
    'SELECT user_id FROM entries WHERE id = ?',
  )
    .bind(id)
    .first<{ user_id: string }>()

  if (!entry) return c.json({ error: 'not_found' }, 404)
  if (entry.user_id !== user.id) return c.json({ error: 'forbidden' }, 403)

  const media = await c.env.DB.prepare(
    'SELECT id FROM media WHERE entry_id = ?',
  )
    .bind(id)
    .all<{ id: string }>()

  if (media.results.length > 0) {
    await c.env.BUCKET.delete(
      media.results.flatMap((item) => [
        `media/${item.id}`,
        `media/${item.id}/preview`,
        `media/${item.id}/thumb`,
      ]),
    )
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM media WHERE entry_id = ?').bind(id),
    c.env.DB.prepare('UPDATE wishes SET entry_id = NULL WHERE entry_id = ?').bind(
      id,
    ),
    c.env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id),
  ])

  return c.json({ ok: true })
})

app.get('/media/:id/preview', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const media = await c.env.DB.prepare(
    'SELECT id, mime, preview_mime, has_preview, entry_id FROM media WHERE id = ?',
  )
    .bind(id)
    .first<{
      id: string
      mime: string
      preview_mime: string | null
      has_preview: number
      entry_id: string | null
    }>()

  if (!media) return c.json({ error: 'not_found' }, 404)

  if (media.entry_id) {
    const entry = await c.env.DB.prepare(
      'SELECT user_id, is_private FROM entries WHERE id = ?',
    )
      .bind(media.entry_id)
      .first<{ user_id: string; is_private: number }>()

    if (entry?.is_private && entry.user_id !== user.id) {
      return c.json({ error: 'forbidden' }, 403)
    }
  }

  const object = await c.env.BUCKET.get(`media/${id}/preview`)
  if (!object) return c.json({ error: 'not_found' }, 404)

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': media.preview_mime ?? media.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  })
})

app.get('/media/:id/thumb', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const media = await c.env.DB.prepare(
    'SELECT id, mime, thumb_mime, has_thumb, entry_id FROM media WHERE id = ?',
  )
    .bind(id)
    .first<{
      id: string
      mime: string
      thumb_mime: string | null
      has_thumb: number
      entry_id: string | null
    }>()

  if (!media) return c.json({ error: 'not_found' }, 404)

  if (media.entry_id) {
    const entry = await c.env.DB.prepare(
      'SELECT user_id, is_private FROM entries WHERE id = ?',
    )
      .bind(media.entry_id)
      .first<{ user_id: string; is_private: number }>()

    if (entry?.is_private && entry.user_id !== user.id) {
      return c.json({ error: 'forbidden' }, 403)
    }
  }

  const object = await c.env.BUCKET.get(`media/${id}/thumb`)
  if (!object) return c.json({ error: 'not_found' }, 404)

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': media.thumb_mime ?? media.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  })
})

function mediaExtension(mime: string) {
  const type = mime.split(';')[0].trim().toLowerCase()
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
  }
  return extensions[type] ?? 'bin'
}

app.get('/media/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const media = await c.env.DB.prepare(
    'SELECT id, mime, size, entry_id FROM media WHERE id = ?',
  )
    .bind(id)
    .first<{
      id: string
      mime: string
      size: number
      entry_id: string | null
    }>()

  if (!media) return c.json({ error: 'not_found' }, 404)

  if (media.entry_id) {
    const entry = await c.env.DB.prepare(
      'SELECT user_id, is_private FROM entries WHERE id = ?',
    )
      .bind(media.entry_id)
      .first<{ user_id: string; is_private: number }>()

    if (entry?.is_private && entry.user_id !== user.id) {
      return c.json({ error: 'forbidden' }, 403)
    }
  }

  const range = c.req.header('Range')
  const download = c.req.query('download') === '1'
  const object = await c.env.BUCKET.get(
    `media/${id}`,
    range ? { range: c.req.raw.headers } : undefined,
  )
  if (!object) return c.json({ error: 'not_found' }, 404)

  const headers = new Headers({
    'Content-Type': media.mime,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': download
      ? `attachment; filename="zhaomu-${id.slice(0, 8)}.${mediaExtension(media.mime)}"`
      : 'inline',
    'Accept-Ranges': 'bytes',
    'Content-Security-Policy':
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  })

  if (range && object.range) {
    let offset = 0
    let length = object.size

    if ('offset' in object.range) {
      offset = object.range.offset ?? 0
      length = object.range.length ?? object.size - offset
    } else if ('suffix' in object.range) {
      length = Math.min(object.range.suffix, object.size)
      offset = object.size - length
    }

    headers.set(
      'Content-Range',
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    )
    headers.set('Content-Length', String(length))
    return new Response(object.body as ReadableStream, {
      status: 206,
      headers,
    })
  }

  headers.set('Content-Length', String(object.size))
  return new Response(object.body as ReadableStream, { headers })
})

app.get('/api/letters', async (c) => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.user_id, l.body, l.unlock_at, l.created_at, l.read_at,
            l.voice_id, m.mime AS voice_mime
     FROM letters l
     LEFT JOIN media m ON m.id = l.voice_id
     ORDER BY l.created_at DESC
     LIMIT 100`,
  ).all<{
    id: string
    user_id: string
    body: string
    unlock_at: string
    created_at: string
    read_at: string | null
    voice_id: string | null
    voice_mime: string | null
  }>()

  const now = Date.now()

  return c.json({
    letters: rows.results.map((row) => {
      const mine = row.user_id === user.id
      const unlocked = mine || Date.parse(row.unlock_at) <= now
      return {
        id: row.id,
        mine,
        locked: !unlocked,
        unlockAt: row.unlock_at,
        createdAt: row.created_at,
        readAt: row.read_at,
        body: unlocked ? row.body : null,
        voice:
          unlocked && row.voice_id
            ? {
                id: row.voice_id,
                url: `/media/${row.voice_id}`,
                mime: row.voice_mime ?? 'audio/webm',
              }
            : null,
      }
    }),
  })
})

app.post('/api/letters', async (c) => {
  const user = c.get('user')
  const body = await c.req
    .json<{ text?: string; voiceId?: string }>()
    .catch(() => null)

  const text = (body?.text ?? '').trim()
  const voiceId = body?.voiceId ?? null

  if (!text && !voiceId) {
    return c.json({ error: 'empty_letter' }, 400)
  }
  if (text.length > 5000) {
    return c.json({ error: 'invalid_text' }, 400)
  }

  let voice: { id: string; url: string; mime: string } | null = null

  if (voiceId) {
    const media = await c.env.DB.prepare(
      `SELECT id, mime FROM media
       WHERE id = ? AND user_id = ? AND kind = 'audio' AND entry_id IS NULL`,
    )
      .bind(voiceId, user.id)
      .first<{ id: string; mime: string }>()

    if (!media) return c.json({ error: 'invalid_voice' }, 400)
    voice = { id: media.id, url: `/media/${media.id}`, mime: media.mime }
  }

  const now = new Date()
  const id = crypto.randomUUID()
  const unlockAt = letterUnlockAt(now)

  await c.env.DB.prepare(
    `INSERT INTO letters (id, user_id, body, unlock_at, created_at, voice_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, text, unlockAt, now.toISOString(), voiceId)
    .run()

  return c.json(
    {
      letter: {
        id,
        mine: true,
        locked: false,
        body: text,
        voice,
        unlockAt,
        createdAt: now.toISOString(),
        readAt: null,
      },
    },
    201,
  )
})

app.get('/api/settings', async (c) => {
  const row = await getSettingsRow(c.env)
  return c.json({ settings: settingsDto(row) })
})

app.put('/api/settings', async (c) => {
  const current = await getSettingsRow(c.env)
  const body = await c.req
    .json<{
      togetherSince?: string
      nextMeeting?: string | null
      birthdays?: (string | null)[]
      cities?: { name?: string; lat?: number; lon?: number }[]
    }>()
    .catch(() => null)

  if (!body) return c.json({ error: 'invalid_body' }, 400)

  const togetherSince = body.togetherSince ?? current.together_since
  if (!isDateString(togetherSince)) {
    return c.json({ error: 'invalid_together_since' }, 400)
  }

  const nextMeeting =
    body.nextMeeting === undefined
      ? current.next_meeting
      : body.nextMeeting || null
  if (nextMeeting && !isDateString(nextMeeting)) {
    return c.json({ error: 'invalid_next_meeting' }, 400)
  }

  const fallbackCities = settingsDto(current).cities
  const cities = body.cities ?? fallbackCities
  if (!Array.isArray(cities) || cities.length !== 2) {
    return c.json({ error: 'invalid_cities' }, 400)
  }

  const normalizedCities = cities.map((city, index) => ({
    name: (city.name ?? fallbackCities[index]?.name ?? '').trim(),
    lat: Number(city.lat ?? fallbackCities[index]?.lat),
    lon: Number(city.lon ?? fallbackCities[index]?.lon),
  }))

  for (const city of normalizedCities) {
    if (!city.name || city.name.length > 30) {
      return c.json({ error: 'invalid_city_name' }, 400)
    }
    if (
      !Number.isFinite(city.lat) ||
      !Number.isFinite(city.lon) ||
      city.lat < -90 ||
      city.lat > 90 ||
      city.lon < -180 ||
      city.lon > 180
    ) {
      return c.json({ error: 'invalid_city_coords' }, 400)
    }
  }

  const birthdays = body.birthdays ?? [
    current.birthday_a,
    current.birthday_b,
  ]
  if (!Array.isArray(birthdays) || birthdays.length !== 2) {
    return c.json({ error: 'invalid_birthdays' }, 400)
  }

  for (const birthday of birthdays) {
    if (birthday && !isDateString(birthday)) {
      return c.json({ error: 'invalid_birthday' }, 400)
    }
  }

  await c.env.DB.prepare(
    `UPDATE couple_settings
     SET together_since = ?, next_meeting = ?,
         city_a_name = ?, city_a_lat = ?, city_a_lon = ?,
         city_b_name = ?, city_b_lat = ?, city_b_lon = ?,
         birthday_a = ?, birthday_b = ?, updated_at = ?
     WHERE id = 1`,
  )
    .bind(
      togetherSince,
      nextMeeting,
      normalizedCities[0].name,
      normalizedCities[0].lat,
      normalizedCities[0].lon,
      normalizedCities[1].name,
      normalizedCities[1].lat,
      normalizedCities[1].lon,
      birthdays[0] || null,
      birthdays[1] || null,
      new Date().toISOString(),
    )
    .run()

  const row = await getSettingsRow(c.env)
  return c.json({ settings: settingsDto(row) })
})

app.get('/api/weather', async (c) => {
  try {
    const row = await getSettingsRow(c.env)
    const cities = [
      { name: row.city_a_name, lat: row.city_a_lat, lon: row.city_a_lon },
      { name: row.city_b_name, lat: row.city_b_lat, lon: row.city_b_lon },
    ]

    const [first, second] = await Promise.all(
      cities.map((city) => fetchCityWeather(city)),
    )

    return c.json({
      cities: [first, second],
      distanceKm: Math.round(distanceKm(cities[0], cities[1])),
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('weather_failed', error)
    return c.json({ error: 'weather_unavailable' }, 502)
  }
})

app.get('/api/geocode', async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (!query) return c.json({ results: [] })

  type GeoItem = {
    id?: number
    name: string
    latitude: number
    longitude: number
    country_code?: string
    country?: string
    admin1?: string
    admin2?: string
    feature_code?: string
    population?: number
  }

  const names = [query]
  if (/[\u3400-\u9fff]/.test(query) && !/[市县区旗盟]$/.test(query)) {
    names.push(`${query}市`)
  }

  const requests = names.map(async (name) => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.searchParams.set('name', name)
    url.searchParams.set('count', '8')
    url.searchParams.set('language', 'zh')
    url.searchParams.set('format', 'json')

    const response = await fetch(url.toString())
    if (!response.ok) return [] as GeoItem[]
    const data = await response.json<{ results?: GeoItem[] }>()
    return data.results ?? []
  })

  const settled = await Promise.allSettled(requests)
  const merged = new Map<string, GeoItem>()

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    for (const item of result.value) {
      if (!item.name) continue
      const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`
      const existing = merged.get(key)
      if (
        !existing ||
        (item.population ?? 0) > (existing.population ?? 0)
      ) {
        merged.set(key, item)
      }
    }
  }

  const score = (item: GeoItem) => {
    const code = item.feature_code ?? ''
    let value = 0
    if (code.startsWith('PPLA')) value += 100
    else if (code.startsWith('PPL')) value += 20
    if (item.country_code === 'CN') value += 10
    value += Math.log10((item.population ?? 0) + 1) * 12
    return value
  }

  const results = [...merged.values()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 8)
    .map((item) => {
      const region = [item.admin2, item.admin1, item.country]
        .filter((part): part is string => Boolean(part))
        .filter(
          (part, index, list) =>
            part !== item.name && list.indexOf(part) === index,
        )
        .join(' · ')

      return {
        name: item.name,
        region,
        lat: item.latitude,
        lon: item.longitude,
      }
    })

  return c.json({ results })
})

app.get('/api/storage', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count, COALESCE(SUM(size + COALESCE(preview_size, 0) + COALESCE(thumb_size, 0)), 0) AS bytes FROM media',
  ).first<{ count: number; bytes: number }>()

  return c.json({
    count: row?.count ?? 0,
    bytes: row?.bytes ?? 0,
  })
})

app.get('/api/export', async (c) => {
  const user = c.get('user')
  const settings = settingsDto(await getSettingsRow(c.env))

  const entries = await c.env.DB.prepare(
    `SELECT id, body, mood, weather, location, is_private, created_at
     FROM entries
     WHERE is_private = 0 OR user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(user.id)
    .all()

  const letters = await c.env.DB.prepare(
    `SELECT id, body, unlock_at, created_at, voice_id
     FROM letters
     WHERE user_id = ? OR unlock_at <= ?
     ORDER BY created_at DESC`,
  )
    .bind(user.id, new Date().toISOString())
    .all()

  const media = await c.env.DB.prepare(
    `SELECT m.id, m.mime, m.kind, m.size, m.entry_id, m.created_at,
            m.has_preview, m.preview_size, m.has_thumb, m.thumb_size
     FROM media m
     LEFT JOIN entries e ON e.id = m.entry_id
     WHERE m.entry_id IS NULL OR e.is_private = 0 OR e.user_id = ?
     ORDER BY m.created_at DESC`,
  )
    .bind(user.id)
    .all()

  const wishes = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.note, w.category, w.target_date,
            w.done, w.done_at, w.created_at, u.name AS author_name
     FROM wishes w JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC`,
  ).all()

  return c.json({
    exportedAt: new Date().toISOString(),
    settings,
    entries: entries.results,
    letters: letters.results,
    media: media.results,
    wishes: wishes.results,
  })
})

app.patch('/api/letters/:id/read', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const letter = await c.env.DB.prepare(
    'SELECT user_id, unlock_at, read_at FROM letters WHERE id = ?',
  )
    .bind(id)
    .first<{ user_id: string; unlock_at: string; read_at: string | null }>()

  if (!letter) return c.json({ error: 'not_found' }, 404)
  if (letter.user_id === user.id) {
    return c.json({ ok: true, readAt: letter.read_at })
  }
  if (Date.parse(letter.unlock_at) > Date.now()) {
    return c.json({ error: 'locked' }, 403)
  }

  const readAt = letter.read_at ?? new Date().toISOString()
  if (!letter.read_at) {
    await c.env.DB.prepare('UPDATE letters SET read_at = ? WHERE id = ?')
      .bind(readAt, id)
      .run()
  }

  return c.json({ ok: true, readAt })
})

app.get('/api/nudges', async (c) => {
  const user = c.get('user')

  const unseen = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM nudges WHERE to_user = ? AND seen_at IS NULL',
  )
    .bind(user.id)
    .first<{ n: number }>()

  const sent = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM nudges WHERE from_user = ? AND created_at >= ?',
  )
    .bind(user.id, shanghaiDayStartIso())
    .first<{ n: number }>()

  return c.json({
    unseen: unseen?.n ?? 0,
    sentToday: sent?.n ?? 0,
  })
})

app.post('/api/nudges', async (c) => {
  const user = c.get('user')

  const sent = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM nudges WHERE from_user = ? AND created_at >= ?',
  )
    .bind(user.id, shanghaiDayStartIso())
    .first<{ n: number }>()

  const count = sent?.n ?? 0
  if (count >= 5) return c.json({ error: 'daily_limit' }, 429)

  const partner = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id != ? LIMIT 1',
  )
    .bind(user.id)
    .first<{ id: string }>()

  if (!partner) return c.json({ error: 'no_partner' }, 409)

  await c.env.DB.prepare(
    'INSERT INTO nudges (id, from_user, to_user, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), user.id, partner.id, new Date().toISOString())
    .run()

  return c.json({ sentToday: count + 1 }, 201)
})

app.patch('/api/nudges/seen', async (c) => {
  const user = c.get('user')

  await c.env.DB.prepare(
    'UPDATE nudges SET seen_at = ? WHERE to_user = ? AND seen_at IS NULL',
  )
    .bind(new Date().toISOString(), user.id)
    .run()

  return c.json({ ok: true })
})

app.get('/api/anniversaries', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.name AS author_name
     FROM anniversaries a JOIN users u ON u.id = a.user_id
     ORDER BY a.date ASC`,
  ).all<{
    id: string
    user_id: string
    author_name: string
    title: string
    date: string
    recurring: number
    created_at: string
  }>()

  return c.json({
    anniversaries: rows.results.map((row) => ({
      id: row.id,
      title: row.title,
      date: row.date,
      recurring: row.recurring === 1,
      createdAt: row.created_at,
      author: { id: row.user_id, name: row.author_name },
    })),
  })
})

app.post('/api/anniversaries', async (c) => {
  const user = c.get('user')
  const body = await c.req
    .json<{ title?: string; date?: string; recurring?: boolean }>()
    .catch(() => null)

  if (!body) return c.json({ error: 'invalid_body' }, 400)

  const title = (body.title ?? '').trim()
  if (!title || title.length > 40) {
    return c.json({ error: 'invalid_title' }, 400)
  }

  const date = body.date ?? ''
  if (!isDateString(date)) {
    return c.json({ error: 'invalid_date' }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO anniversaries (id, user_id, title, date, recurring, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, title, date, body.recurring ? 1 : 0, new Date().toISOString())
    .run()

  return c.json(
    {
      anniversary: {
        id,
        title,
        date,
        recurring: Boolean(body.recurring),
        createdAt: new Date().toISOString(),
        author: { id: user.id, name: user.name },
      },
    },
    201,
  )
})

app.delete('/api/anniversaries/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(
    'SELECT user_id FROM anniversaries WHERE id = ?',
  )
    .bind(id)
    .first<{ user_id: string }>()

  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.user_id !== user.id) return c.json({ error: 'forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM anniversaries WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

app.get('/api/wishes', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT w.*, u.name AS author_name
     FROM wishes w JOIN users u ON u.id = w.user_id
     ORDER BY w.done ASC, w.created_at DESC`,
  ).all<WishRow>()

  return c.json({ wishes: rows.results.map(wishDto) })
})

app.post('/api/wishes', async (c) => {
  const user = c.get('user')
  const body = await c.req
    .json<{
      title?: string
      note?: string
      category?: string
      targetDate?: string | null
    }>()
    .catch(() => null)

  if (!body) return c.json({ error: 'invalid_body' }, 400)

  const title = (body.title ?? '').trim()
  if (!title || title.length > 80) {
    return c.json({ error: 'invalid_title' }, 400)
  }

  const note = (body.note ?? '').trim() || null
  if (note && note.length > 500) {
    return c.json({ error: 'invalid_note' }, 400)
  }

  const category = (body.category ?? '其他').trim() || '其他'
  if (category.length > 20) {
    return c.json({ error: 'invalid_category' }, 400)
  }

  const targetDate = body.targetDate || null
  if (targetDate && !isDateString(targetDate)) {
    return c.json({ error: 'invalid_target_date' }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO wishes (id, user_id, title, note, category, target_date, done, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(
      id,
      user.id,
      title,
      note,
      category,
      targetDate,
      new Date().toISOString(),
    )
    .run()

  const wish = await getWish(c.env, id)
  return c.json({ wish: wishDto(wish!) }, 201)
})

app.patch('/api/wishes/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const wish = await getWish(c.env, id)

  if (!wish) return c.json({ error: 'not_found' }, 404)

  const body = await c.req
    .json<{
      done?: boolean
      title?: string
      note?: string | null
      category?: string
      targetDate?: string | null
    }>()
    .catch(() => null)

  if (!body) return c.json({ error: 'invalid_body' }, 400)

  const owner = wish.user_id === user.id
  const editsContent =
    body.title !== undefined ||
    body.note !== undefined ||
    body.category !== undefined ||
    body.targetDate !== undefined

  if (!owner && editsContent) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const title = owner && body.title !== undefined ? body.title.trim() : wish.title
  if (!title || title.length > 80) {
    return c.json({ error: 'invalid_title' }, 400)
  }

  const note =
    owner && body.note !== undefined
      ? (body.note ?? '').trim() || null
      : wish.note
  if (note && note.length > 500) {
    return c.json({ error: 'invalid_note' }, 400)
  }

  const category =
    owner && body.category !== undefined ? body.category.trim() : wish.category
  if (!category || category.length > 20) {
    return c.json({ error: 'invalid_category' }, 400)
  }

  const targetDate =
    owner && body.targetDate !== undefined
      ? body.targetDate || null
      : wish.target_date
  if (targetDate && !isDateString(targetDate)) {
    return c.json({ error: 'invalid_target_date' }, 400)
  }

  const nextDone = body.done === undefined ? wish.done === 1 : body.done
  let entryId = wish.entry_id

  if (!wish.done && nextDone) {
    entryId = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO entries (id, user_id, body, mood, weather, location, is_private, created_at)
       VALUES (?, ?, ?, '✅', NULL, NULL, 0, ?)`,
    )
      .bind(
        entryId,
        user.id,
        `完成了一个愿望：${wish.title}`,
        new Date().toISOString(),
      )
      .run()
  }

  const doneAt = nextDone
    ? wish.done
      ? wish.done_at
      : new Date().toISOString()
    : null

  await c.env.DB.prepare(
    `UPDATE wishes
     SET title = ?, note = ?, category = ?, target_date = ?,
         done = ?, done_at = ?, entry_id = ?
     WHERE id = ?`,
  )
    .bind(
      title,
      note,
      category,
      targetDate,
      nextDone ? 1 : 0,
      doneAt,
      entryId,
      id,
    )
    .run()

  const updated = await getWish(c.env, id)
  return c.json({ wish: wishDto(updated!) })
})

app.delete('/api/wishes/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const wish = await getWish(c.env, id)

  if (!wish) return c.json({ error: 'not_found' }, 404)
  if (wish.user_id !== user.id) {
    return c.json({ error: 'forbidden' }, 403)
  }

  await c.env.DB.prepare('DELETE FROM wishes WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'server_error' }, 500)
})

export default app
