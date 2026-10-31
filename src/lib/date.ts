import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export const todayLabel = () => dayjs().format('M月D日 · ddd')

export const greetingOf = (hour: number) => {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 23) return '晚上好'
  return '夜深了'
}

export const daysSince = (date: string) =>
  dayjs().startOf('day').diff(dayjs(date).startOf('day'), 'day')

export const daysUntilNext = (date: string) => {
  const now = dayjs().startOf('day')
  let next = dayjs(date).year(now.year())
  if (next.isBefore(now, 'day')) next = next.add(1, 'year')
  return next.diff(now, 'day')
}

export const dayLabel = (iso: string) => {
  const diff = dayjs().startOf('day').diff(dayjs(iso).startOf('day'), 'day')
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  return dayjs(iso).format('M月D日')
}

export const dayDate = (iso: string) => dayjs(iso).format('M月D日 · ddd')

export const monthLabel = (iso: string) => dayjs(iso).format('YYYY年M月')

export const hms = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
