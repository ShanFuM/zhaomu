import type { ApiAnniversary, ApiSettings, WeatherResponse } from './api'

export interface HomeCache {
  settings: ApiSettings | null
  weather: WeatherResponse | null
  lettersToday: number | null
  nudges: { unseen: number; sentToday: number }
  anniversaries: ApiAnniversary[]
}

const KEY = 'zhaomu:home-cache-v2'
let memory: HomeCache | null = null

export function readHomeCache(): HomeCache | null {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) memory = JSON.parse(raw) as HomeCache
  } catch {
    /* 忽略损坏的缓存 */
  }
  return memory
}

export function writeHomeCache(value: HomeCache) {
  memory = value
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* 隐私模式下只保留内存缓存 */
  }
}

export function invalidateHomeCache() {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 忽略 */
  }
}

export function patchHomeCache(partial: Partial<HomeCache>) {
  const current = readHomeCache()
  if (!current) return
  writeHomeCache({ ...current, ...partial })
}
