import dayjs from 'dayjs'
import { CloudRain, CloudSnow, CloudSun, Heart, Mail, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  cities as fallbackCities,
  cityDistance as fallbackDistance,
  nextMeetingDate as fallbackMeeting,
  togetherSince as fallbackTogether,
} from '../data/mock'
import {
  api,
  type ApiAnniversary,
  type ApiSettings,
  type WeatherResponse,
} from '../lib/api'
import { daysSince, daysUntilNext, greetingOf, hms, todayLabel } from '../lib/date'
import { readHomeCache, writeHomeCache } from '../lib/homeCache'
import { distanceKm } from '../lib/geo'
import { loveNoteOf } from '../lib/loveNotes'
import { pronounLabel } from '../lib/pronoun'
import { useNow } from '../lib/useNow'

type CityKind = 'sun' | 'cloud' | 'rain' | 'snow'

interface CityView {
  name: string
  temp: number
  high: number
  low: number
  label: string
  kind: CityKind
}

const FALLBACK: CityView[] = fallbackCities.map((city) => ({
  name: city.name,
  temp: city.temp,
  high: city.high,
  low: city.low,
  label: city.cond,
  kind: city.kind,
}))

function WeatherIcon({ kind }: { kind: CityKind }) {
  if (kind === 'rain') return <CloudRain size={18} strokeWidth={1.6} />
  if (kind === 'snow') return <CloudSnow size={18} strokeWidth={1.6} />
  if (kind === 'sun') return <Sun size={18} strokeWidth={1.6} />
  return <CloudSun size={18} strokeWidth={1.6} />
}

function HomeSkeleton() {
  return (
    <div className="home-skeleton" aria-label="正在加载">
      <div className="sk sk-hero" />
      <div className="sk-grid">
        <div className="sk sk-weather" />
        <div className="sk sk-weather" />
      </div>
      <div className="sk sk-line" />
      <div className="sk sk-letter" />
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const now = useNow()
  const hour = new Date(now).getHours()
  const loveNote = loveNoteOf()
  const cached = readHomeCache()

  const [settings, setSettings] = useState<ApiSettings | null>(
    cached?.settings ?? null,
  )
  const [weather, setWeather] = useState<WeatherResponse | null>(
    cached?.weather ?? null,
  )
  const [todayLetters, setTodayLetters] = useState<number | null>(
    cached?.lettersToday ?? null,
  )
  const [nudgeState, setNudgeState] = useState(
    cached?.nudges ?? { unseen: 0, sentToday: 0 },
  )
  const [anniversaries, setAnniversaries] = useState<ApiAnniversary[]>(
    cached?.anniversaries ?? [],
  )
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let alive = true

    const load = async () => {
      const [settingsResult, weatherResult, lettersResult, nudgesResult, anniversaryResult] =
        await Promise.allSettled([
          api.settings(),
          api.weather(),
          api.letters(),
          api.nudges(),
          api.anniversaries(),
        ])
      if (!alive) return

      const nextSettings =
        settingsResult.status === 'fulfilled'
          ? settingsResult.value.settings
          : settings
      const nextWeather =
        weatherResult.status === 'fulfilled' ? weatherResult.value : weather
      const nextLetters =
        lettersResult.status === 'fulfilled'
          ? lettersResult.value.letters.filter((letter) =>
              dayjs(letter.createdAt).isSame(dayjs(), 'day'),
            ).length
          : todayLetters
      const nextNudges =
        nudgesResult.status === 'fulfilled'
          ? nudgesResult.value
          : nudgeState
      const nextAnniversaries =
        anniversaryResult.status === 'fulfilled'
          ? anniversaryResult.value.anniversaries
          : anniversaries

      setSettings(nextSettings)
      setWeather(nextWeather)
      setTodayLetters(nextLetters)
      setNudgeState(nextNudges)
      setAnniversaries(nextAnniversaries)
      setLoading(false)
      writeHomeCache({
        settings: nextSettings,
        weather: nextWeather,
        lettersToday: nextLetters,
        nudges: nextNudges,
        anniversaries: nextAnniversaries,
      })
    }

    load()
    const timer = window.setInterval(load, 30 * 60 * 1000)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const cards: CityView[] = weather
    ? weather.cities.map((city) => ({
        name: city.name,
        temp: city.temp,
        high: city.high,
        low: city.low,
        label: city.label,
        kind: city.kind,
      }))
    : FALLBACK

  const partner = cards[1]
  const togetherSince = settings?.togetherSince ?? fallbackTogether
  const days = daysSince(togetherSince)

  const meetingDate =
    settings === null ? fallbackMeeting : settings.nextMeeting
  const rawMeetingDays = meetingDate
    ? Math.round(
        (new Date(`${meetingDate}T00:00:00`).getTime() -
          new Date(now).setHours(0, 0, 0, 0)) /
          86400000,
      )
    : null
  const meetingDays =
    rawMeetingDays === null ? null : Math.max(0, rawMeetingDays)
  const meetingPassed = rawMeetingDays !== null && rawMeetingDays < 0

  const pronoun = pronounLabel(user?.partnerPronoun)
  const birthdayOwners = settings?.birthdayOwners ?? []
  const partnerBirthdayIndex = user
    ? birthdayOwners.findIndex((id) => id !== user.id)
    : -1
  const birthday =
    settings && partnerBirthdayIndex >= 0
      ? settings.birthdays[partnerBirthdayIndex]
      : (settings?.birthdays[1] ?? null)
  const birthdayDays = birthday ? daysUntilNext(birthday) : null

  const distance =
    settings && settings.cities.length === 2
      ? Math.round(distanceKm(settings.cities[0], settings.cities[1]))
      : (weather?.distanceKm ?? fallbackDistance)

  const thousand = dayjs(togetherSince).add(999, 'day')
  const thousandDays = thousand
    .startOf('day')
    .diff(dayjs().startOf('day'), 'day')

  const today = dayjs().startOf('day')
  const upcomingAnniversaries = anniversaries
    .map((item) => {
      const base = dayjs(item.date)
      let next = base
      if (item.recurring) {
        next = base.year(today.year())
        if (next.isBefore(today, 'day')) next = next.add(1, 'year')
      }
      return { ...item, next }
    })
    .filter((item) => item.next.startOf('day').diff(today, 'day') >= 0)
    .sort((a, b) => a.next.valueOf() - b.next.valueOf())

  const target = new Date(now)
  target.setHours(23, 0, 0, 0)
  const open = target.getTime() <= now
  const countdown = hms(target.getTime() - now)

  const [hearts, setHearts] = useState<number[]>([])
  const [nudgeError, setNudgeError] = useState('')
  const lastNudgeRef = useRef(0)

  const nudge = () => {
    if (nudgeState.sentToday >= 5) return

    const now = Date.now()
    if (now - lastNudgeRef.current < 300) return
    lastNudgeRef.current = now

    setNudgeError('')
    setNudgeState((prev) => ({
      ...prev,
      sentToday: Math.min(5, prev.sentToday + 1),
    }))

    const id = now
    setHearts((h) => [...h, id])
    window.setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 1100)

    void api
      .sendNudge()
      .then((result) => {
        setNudgeState((prev) => ({
          ...prev,
          sentToday: Math.max(prev.sentToday, result.sentToday),
        }))
      })
      .catch(() => {
        setNudgeState((prev) => ({
          ...prev,
          sentToday: Math.max(0, prev.sentToday - 1),
        }))
        setNudgeError('没戳出去，再试一次')
      })
  }

  const readNudges = async () => {
    try {
      await api.markNudgesSeen()
      setNudgeState((prev) => ({ ...prev, unseen: 0 }))
    } catch {
      /* 忽略 */
    }
  }

  const weatherNote =
    partner.kind === 'rain'
      ? `${partner.name} ${partner.temp}°C 有${partner.label}，记得提醒${pronoun}带伞。`
      : partner.kind === 'snow'
        ? `${partner.name} ${partner.temp}°C 在${partner.label}，提醒${pronoun}多穿一点。`
        : `${partner.name} ${partner.label}，${partner.low}°C 到 ${partner.high}°C。`

  if (loading && !cached) {
    return <HomeSkeleton />
  }

  return (
    <>
      <p className="eyebrow">
        {todayLabel()} · {greetingOf(hour)}
      </p>
      <h1 className="greeting">{loveNote}</h1>

      <section className="hero" aria-label="我们在一起的天数">
        <div className="hero-label">我们在一起</div>
        <div className="hero-days">
          {days}
          <small>天</small>
        </div>
        <div className="hero-rule" />
        <div className="hero-meta">
          <div>
            <span>距下次见面</span>
            <strong>
              {meetingPassed
                ? '已见面'
                : meetingDays === null
                  ? '指日可待'
                  : `${meetingDays} 天`}
            </strong>
          </div>
          <div>
            <span>两座城市</span>
            <strong>直线 {distance.toLocaleString()} km</strong>
          </div>
        </div>
      </section>

      <section className="section" aria-label="两地天气">
        <div className="section-head">
          <h2>今天的天气</h2>
          <span className="meta">
            {partner.kind === 'rain'
              ? `${pronoun}那边在下雨`
              : partner.kind === 'snow'
                ? `${pronoun}那边在下雪`
                : '实时天气'}
          </span>
        </div>
        <div className="weather-grid">
          {cards.map((city) => (
            <article className="weather-card" key={city.name}>
              <div className="weather-top">
                <span>{city.name}</span>
                <WeatherIcon kind={city.kind} />
              </div>
              <div className="weather-temp">
                {city.temp}
                <small>°C</small>
              </div>
              <div className="weather-cond">
                {city.label} · {city.low}° / {city.high}°
              </div>
            </article>
          ))}
        </div>
        <div className="weather-note">
          <WeatherIcon kind={partner.kind} />
          {weatherNote}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>今晚的信箱</h2>
          <Link to="/mailbox">进去看看</Link>
        </div>
        <Link to="/mailbox" className="letter-card">
          <span className="letter-icon">
            <Mail size={20} strokeWidth={1.7} />
          </span>
          <span className="letter-body">
            <span className="letter-title">
              {open
                ? '今天的信已经开启'
                : todayLetters
                  ? `今天已封存 ${todayLetters} 封`
                  : '今天的信已封存'}
            </span>
            <span className="letter-sub">
              {open
                ? '23:00 已过，可以拆开了'
                : todayLetters
                  ? '23:00 统一开启，在那之前谁都看不到'
                  : '23:00 开启，之前谁都看不到'}
            </span>
          </span>
          <span className={`letter-time${open ? ' open' : ''}`}>
            {open ? '开启' : countdown}
          </span>
        </Link>
        {nudgeState.unseen > 0 && (
          <div className="nudge-inbox">
            <span>{pronoun}戳了你 {nudgeState.unseen} 下</span>
            <button onClick={readNudges}>知道啦</button>
          </div>
        )}
        <button
          className="nudge"
          onClick={nudge}
          disabled={nudgeState.sentToday >= 5}
          aria-label="戳一下对方"
        >
          <Heart size={17} strokeWidth={1.8} />
          想{pronoun}了就戳一下
          <small>
            {nudgeState.sentToday >= 5
              ? '今天戳满啦'
              : `今天已戳 ${nudgeState.sentToday} 次`}
          </small>
          {hearts.map((id) => (
            <Heart
              key={id}
              className="heart-fly"
              size={18}
              fill="currentColor"
              strokeWidth={0}
            />
          ))}
        </button>
        {nudgeError && <p className="nudge-error">{nudgeError}</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>纪念日</h2>
          <Link to="/settings">管理</Link>
        </div>
        <div className="chips">
          <div className="chip">
            <span>在一起</span>
            <strong>
              {days}
              <em>天</em>
            </strong>
          </div>
          <div className="chip">
            <span>{pronoun}的生日</span>
            <strong>
              {birthdayDays === null ? '待填' : `还有 ${birthdayDays}`}
              {birthdayDays !== null && <em>天</em>}
            </strong>
          </div>
          {upcomingAnniversaries.slice(0, 2).map((item) => {
            const days = item.next.startOf('day').diff(today, 'day')
            return (
              <div className="chip" key={item.id}>
                <span>{item.title}</span>
                <strong>
                  {days === 0 ? (
                    '就是今天'
                  ) : (
                    <>
                      {days}
                      <em>天</em>
                    </>
                  )}
                </strong>
              </div>
            )
          })}
          <div className="chip">
            <span>下次见面</span>
            <strong>
              {meetingPassed ? (
                '已见面'
              ) : meetingDays === null ? (
                '指日可待'
              ) : (
                <>
                  {meetingDays}
                  <em>天</em>
                </>
              )}
            </strong>
          </div>
          <div className="chip">
            <span>第 1000 天</span>
            <strong>
              {thousandDays > 0 ? (
                <>
                  还有 {thousandDays}
                  <em>天</em>
                </>
              ) : thousandDays === 0 ? (
                '就是今天'
              ) : (
                <>
                  已过
                  <em>{thousand.format('YYYY.MM.DD')}</em>
                </>
              )}
            </strong>
          </div>
        </div>
      </section>

      <p className="footer-note">朝暮 · 只属于我们</p>
    </>
  )
}
