import { getKeepOriginal } from './photoPrefs'

export interface User {
  id: string
  name: string
  email: string
}

export interface MediaRef {
  id: string
  kind: string
  mime: string
  previewUrl: string
}

export interface ApiEntry {
  id: string
  body: string
  mood: string | null
  weather: string | null
  location: string | null
  private: boolean
  createdAt: string
  author: { id: string; name: string }
  media: MediaRef[]
}

export interface ApiPhoto {
  id: string
  url: string
  previewUrl: string
  mime: string
  takenAt: string
  standalone: boolean
  mine: boolean
}

export interface ApiLetter {
  id: string
  mine: boolean
  locked: boolean
  body: string | null
  voice: { id: string; url: string; mime: string } | null
  unlockAt: string
  createdAt: string
  readAt: string | null
}

export interface City {
  name: string
  lat: number
  lon: number
}

export interface ApiSettings {
  togetherSince: string
  nextMeeting: string | null
  birthdays: (string | null)[]
  cities: City[]
  updatedAt: string
}

export interface WeatherCity extends City {
  temp: number
  feels: number
  humidity: number
  wind: number
  high: number
  low: number
  sunrise: string | null
  sunset: string | null
  label: string
  kind: 'sun' | 'cloud' | 'rain' | 'snow'
  code: number
}

export interface WeatherResponse {
  cities: [WeatherCity, WeatherCity]
  distanceKm: number
  updatedAt: string
}

export interface GeocodeResult {
  name: string
  region: string
  lat: number
  lon: number
}

export interface StorageStats {
  count: number
  bytes: number
}

export interface ApiWish {
  id: string
  title: string
  note: string | null
  category: string
  targetDate: string | null
  done: boolean
  doneAt: string | null
  entryId: string | null
  createdAt: string
  author: { id: string; name: string }
}

export interface ApiAnniversary {
  id: string
  title: string
  date: string
  recurring: boolean
  createdAt: string
  author: { id: string; name: string }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })

  const text = await response.text()
  let data: unknown = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('zhaomu:unauthorized'))
    }
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`
    throw new ApiError(response.status, message)
  }

  return data as T
}

export const api = {
  status: () => request<{ needsSetup: boolean }>('/api/auth/status'),

  setup: (payload: {
    code: string
    users: { name: string; email: string; password: string }[]
  }) =>
    request<{ user: User }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/api/me'),

  entries: () => request<{ entries: ApiEntry[] }>('/api/entries'),

  createEntry: (payload: {
    text: string
    mood?: string
    private?: boolean
    mediaIds?: string[]
  }) =>
    request<{ entry: ApiEntry }>('/api/entries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteEntry: (id: string) =>
    request<{ ok: boolean }>(`/api/entries/${id}`, { method: 'DELETE' }),

  album: () => request<{ photos: ApiPhoto[] }>('/api/album'),

  deleteMedia: (id: string) =>
    request<{ ok: boolean }>(`/api/media/${id}`, { method: 'DELETE' }),

  upload: (file: File, preview?: File | null) => {
    const form = new FormData()
    form.append('file', file)
    form.append('keepOriginal', getKeepOriginal() ? '1' : '0')
    if (preview) form.append('preview', preview)
    return request<{
      id: string
      url: string
      previewUrl: string
      mime: string
      kind: string
      hasPreview: boolean
    }>('/api/media', { method: 'POST', body: form })
  },

  letters: () => request<{ letters: ApiLetter[] }>('/api/letters'),

  createLetter: (text: string, voiceId?: string | null) =>
    request<{ letter: ApiLetter }>('/api/letters', {
      method: 'POST',
      body: JSON.stringify({ text, voiceId: voiceId ?? null }),
    }),

  readLetter: (id: string) =>
    request<{ ok: boolean; readAt: string | null }>(
      `/api/letters/${id}/read`,
      { method: 'PATCH' },
    ),

  settings: () => request<{ settings: ApiSettings }>('/api/settings'),

  updateSettings: (settings: {
    togetherSince: string
    nextMeeting: string | null
    birthdays: (string | null)[]
    cities: City[]
  }) =>
    request<{ settings: ApiSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  weather: () => request<WeatherResponse>('/api/weather'),

  geocode: (query: string) =>
    request<{ results: GeocodeResult[] }>(
      `/api/geocode?q=${encodeURIComponent(query)}`,
    ),

  storage: () => request<StorageStats>('/api/storage'),

  exportData: () => request<Record<string, unknown>>('/api/export'),

  wishes: () => request<{ wishes: ApiWish[] }>('/api/wishes'),

  nudges: () =>
    request<{ unseen: number; sentToday: number }>('/api/nudges'),

  sendNudge: () =>
    request<{ sentToday: number }>('/api/nudges', { method: 'POST' }),

  markNudgesSeen: () =>
    request<{ ok: boolean }>('/api/nudges/seen', { method: 'PATCH' }),

  anniversaries: () =>
    request<{ anniversaries: ApiAnniversary[] }>('/api/anniversaries'),

  createAnniversary: (payload: {
    title: string
    date: string
    recurring: boolean
  }) =>
    request<{ anniversary: ApiAnniversary }>('/api/anniversaries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteAnniversary: (id: string) =>
    request<{ ok: boolean }>(`/api/anniversaries/${id}`, {
      method: 'DELETE',
    }),
  createWish: (payload: {
    title: string
    note?: string
    category?: string
    targetDate?: string | null
  }) =>
    request<{ wish: ApiWish }>('/api/wishes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWish: (
    id: string,
    payload: {
      done?: boolean
      title?: string
      note?: string | null
      category?: string
      targetDate?: string | null
    },
  ) =>
    request<{ wish: ApiWish }>(`/api/wishes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteWish: (id: string) =>
    request<{ ok: boolean }>(`/api/wishes/${id}`, { method: 'DELETE' }),
}
