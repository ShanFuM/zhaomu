import dayjs from 'dayjs'
import { distanceKm } from '../lib/geo'

// 首页在 API 还没返回时使用的兜底值，全部是通用占位数据。
export const togetherSince = '2020-01-01'
export const nextMeetingDate = dayjs().add(12, 'day').format('YYYY-MM-DD')

export type WeatherKind = 'sun' | 'cloud' | 'rain'

export const cities = [
  {
    id: 'bj',
    name: '北京',
    lat: 39.9042,
    lon: 116.4074,
    temp: 21,
    cond: '多云',
    kind: 'cloud' as WeatherKind,
    high: 24,
    low: 17,
  },
  {
    id: 'sh',
    name: '上海',
    lat: 31.2304,
    lon: 121.4737,
    temp: 18,
    cond: '小雨',
    kind: 'rain' as WeatherKind,
    high: 20,
    low: 15,
  },
]

export const cityDistance = Math.round(distanceKm(cities[0], cities[1]))

export interface Entry {
  id: string
  at: string
  text: string
  mood?: string
  weather?: string
  location?: string
  tags: string[]
  photos?: string[]
  photoThumbs?: string[]
  photoPreviews?: string[]
  voices?: string[]
  private?: boolean
  author?: { id: string; name: string }
}
