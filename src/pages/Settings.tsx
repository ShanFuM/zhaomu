import dayjs from 'dayjs'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Info,
  LogOut,
  MapPin,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type ApiAnniversary,
  type ApiSettings,
  type City,
  type GeocodeResult,
  type StorageStats,
} from '../lib/api'
import {
  applyMode,
  getSavedMode,
  MODE_KEY,
  type Mode,
} from '../lib/appearance'
import { patchHomeCache } from '../lib/homeCache'
import { getKeepOriginal, setKeepOriginal } from '../lib/photoPrefs'

const THEMES = [
  { id: 'sand', name: '暮砂', paper: '#F2ECE4', accent: '#A9705F' },
  { id: 'sage', name: '青瓷', paper: '#ECF0E7', accent: '#6E8A69' },
  { id: 'pink', name: '藕粉', paper: '#F4EDEC', accent: '#B07E80' },
  { id: 'dai', name: '黛色', paper: '#EBEDF0', accent: '#6F7F96' },
]

const MODES: { id: Mode; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'auto', label: '20:00 自动' },
]

type SheetKind =
  | 'cities'
  | 'anniversary'
  | 'meeting'
  | 'storage'
  | 'privacy'
  | 'about'
  | null

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function CityField({
  label,
  value,
  onChange,
}: {
  label: string
  value: City
  onChange: (city: City) => void
}) {
  const [query, setQuery] = useState(value.name)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    setQuery(value.name)
  }, [value.name])

  useEffect(() => {
    const text = query.trim()
    if (!text || text === value.name) {
      setResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const result = await api.geocode(text)
        setResults(result.results)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)

    return () => window.clearTimeout(timer)
  }, [query, value.name])

  return (
    <div className="field">
      <span>{label}</span>
      <input
        value={query}
        placeholder="输入城市名，比如 杭州"
        onChange={(event) => setQuery(event.target.value)}
      />
      {searching && <small className="hint">搜索中…</small>}
      {query.trim() && query.trim() !== value.name && (
        <small className="hint">
          当前仍是「{value.name}」，请从搜索结果里选一个
        </small>
      )}
      {results.length > 0 && (
        <div className="city-results">
          {results.map((item) => (
            <button
              key={`${item.lat},${item.lon}`}
              onClick={() => {
                onChange({ name: item.name, lat: item.lat, lon: item.lon })
                setQuery(item.name)
                setResults([])
              }}
            >
              <strong>{item.name}</strong>
              <span>{item.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'sand',
  )
  const [mode, setMode] = useState<Mode>(() => getSavedMode())
  const [settings, setSettings] = useState<ApiSettings | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [anniversaries, setAnniversaries] = useState<ApiAnniversary[]>([])
  const [anniversaryForm, setAnniversaryForm] = useState({
    title: '',
    date: '',
    recurring: true,
  })
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [keepOriginal, setKeepOriginalState] = useState(() =>
    getKeepOriginal(),
  )

  const [cityDraft, setCityDraft] = useState<City[]>([])
  const [anniversaryDraft, setAnniversaryDraft] = useState({
    togetherSince: '',
    birthdayA: '',
    birthdayB: '',
  })
  const [meetingDraft, setMeetingDraft] = useState('')

  useEffect(() => {
    api
      .settings()
      .then((result) => setSettings(result.settings))
      .catch(() => setError('设置加载失败'))

    api
      .storage()
      .then(setStats)
      .catch(() => {})

    api
      .anniversaries()
      .then((result) => setAnniversaries(result.anniversaries))
      .catch(() => {})
  }, [])

  const choose = (id: string) => {
    setTheme(id)
    document.documentElement.setAttribute('data-theme', id)
    try {
      localStorage.setItem('zhaomu-theme', id)
    } catch {
      /* 隐私模式下忽略 */
    }
    applyMode(mode)
  }

  const chooseMode = (next: Mode) => {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* 隐私模式下忽略 */
    }
    applyMode(next)
  }

  const persist = async (
    patch: Partial<
      Pick<ApiSettings, 'togetherSince' | 'nextMeeting' | 'birthdays' | 'cities'>
    >,
  ) => {
    if (!settings) return

    setSaving(true)
    setError('')

    try {
      const result = await api.updateSettings({
        togetherSince: patch.togetherSince ?? settings.togetherSince,
        nextMeeting:
          patch.nextMeeting !== undefined
            ? patch.nextMeeting
            : settings.nextMeeting,
        birthdays: patch.birthdays ?? settings.birthdays,
        cities: patch.cities ?? settings.cities,
      })
      setSettings(result.settings)
      patchHomeCache({ settings: result.settings })
      setSheet(null)
    } catch {
      setError('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const addAnniversary = async () => {
    const title = anniversaryForm.title.trim()
    if (!title || !anniversaryForm.date || saving) return

    setSaving(true)
    setError('')

    try {
      const result = await api.createAnniversary({
        title,
        date: anniversaryForm.date,
        recurring: anniversaryForm.recurring,
      })
      const next = [...anniversaries, result.anniversary]
      setAnniversaries(next)
      patchHomeCache({ anniversaries: next })
      setAnniversaryForm({ title: '', date: '', recurring: true })
    } catch {
      setError('添加纪念日失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const removeAnniversary = async (item: ApiAnniversary) => {
    if (!window.confirm(`删除「${item.title}」？`)) return

    try {
      await api.deleteAnniversary(item.id)
      const next = anniversaries.filter((entry) => entry.id !== item.id)
      setAnniversaries(next)
      patchHomeCache({ anniversaries: next })
    } catch {
      setError('删除失败，请重试')
    }
  }

  const openCities = () => {
    if (!settings) return
    setCityDraft(settings.cities)
    setError('')
    setSheet('cities')
  }

  const openAnniversary = () => {
    if (!settings) return
    setAnniversaryDraft({
      togetherSince: settings.togetherSince,
      birthdayA: settings.birthdays[0] ?? '',
      birthdayB: settings.birthdays[1] ?? '',
    })
    setError('')
    setSheet('anniversary')
  }

  const openMeeting = () => {
    if (!settings) return
    setMeetingDraft(settings.nextMeeting ?? '')
    setError('')
    setSheet('meeting')
  }

  const exportData = async () => {
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `zhaomu-${dayjs().format('YYYY-MM-DD')}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('导出失败，请稍后重试')
    }
  }

  const togetherDays = settings
    ? dayjs().startOf('day').diff(dayjs(settings.togetherSince), 'day')
    : null

  const meetingDays =
    settings?.nextMeeting != null
      ? dayjs(settings.nextMeeting).startOf('day').diff(dayjs().startOf('day'), 'day')
      : null

  const sheetTitles: Record<Exclude<SheetKind, null>, string> = {
    cities: '我们的城市',
    anniversary: '纪念日',
    meeting: '下次见面',
    storage: '照片存储',
    privacy: '隐私与可见范围',
    about: '关于朝暮',
  }

  return (
    <>
      <Link to="/" className="back">
        <ChevronLeft size={15} /> 返回
      </Link>
      <h1 className="page-title">设置</h1>
      <p className="page-sub">主题、城市、纪念日和数据都在这里</p>

      <section className="section" style={{ marginTop: 20 }}>
        <div className="section-head">
          <h2>主题色</h2>
          <span className="meta">低饱和莫兰迪</span>
        </div>
        <div className="theme-grid" role="radiogroup" aria-label="主题色">
          {THEMES.map((item) => (
            <button
              key={item.id}
              role="radio"
              aria-checked={theme === item.id}
              className={`theme${theme === item.id ? ' on' : ''}`}
              onClick={() => choose(item.id)}
            >
              <span
                className="swatch"
                style={{
                  background: `linear-gradient(135deg, ${item.paper} 0 52%, ${item.accent} 52% 100%)`,
                }}
              />
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>显示模式</h2>
          <span className="meta">
            {mode === 'auto' ? '20:00 自动' : mode === 'dark' ? '深色' : '浅色'}
          </span>
        </div>
        <div className="seg" role="radiogroup" aria-label="显示模式">
          {MODES.map((item) => (
            <button
              key={item.id}
              role="radio"
              aria-checked={mode === item.id}
              className={mode === item.id ? 'on' : ''}
              onClick={() => chooseMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hint">
          自动模式在 20:00–07:00 使用深色，其他时间回到浅色；页面开着也会自动切换。
        </p>
      </section>

      <div className="group">
        <div className="row">
          <User size={17} strokeWidth={1.6} />
          {user?.name ?? '我们'}
          <small>{user?.email}</small>
        </div>
        <button className="row row-button" onClick={logout}>
          <LogOut size={17} strokeWidth={1.6} />
          退出登录
          <ChevronRight size={16} className="chev" />
        </button>
      </div>

      <div className="group">
        <button className="row row-button" onClick={openCities} disabled={!settings}>
          <MapPin size={17} strokeWidth={1.6} />
          我们的城市
          <small>{settings?.cities.map((city) => city.name).join(' · ') ?? '加载中'}</small>
          <ChevronRight size={16} className="chev" />
        </button>
        <button
          className="row row-button"
          onClick={openAnniversary}
          disabled={!settings}
        >
          <CalendarDays size={17} strokeWidth={1.6} />
          纪念日
          <small>{togetherDays === null ? '加载中' : `在一起 ${togetherDays} 天`}</small>
          <ChevronRight size={16} className="chev" />
        </button>
        <button
          className="row row-button"
          onClick={openMeeting}
          disabled={!settings}
        >
          <MapPin size={17} strokeWidth={1.6} />
          下次见面
          <small>
            {settings?.nextMeeting
              ? meetingDays === null
                ? dayjs(settings.nextMeeting).format('M月D日')
                : meetingDays >= 0
                  ? `${dayjs(settings.nextMeeting).format('M月D日')} · ${meetingDays} 天后`
                  : `已过 ${Math.abs(meetingDays)} 天`
              : '指日可待'}
          </small>
          <ChevronRight size={16} className="chev" />
        </button>
      </div>

      <div className="group">
        <button className="row row-button" onClick={() => setSheet('storage')}>
          <Database size={17} strokeWidth={1.6} />
          照片存储
          <small>{stats ? `${stats.count} 张` : 'R2 · 私有桶'}</small>
          <ChevronRight size={16} className="chev" />
        </button>
        <button className="row row-button" onClick={exportData}>
          <Download size={17} strokeWidth={1.6} />
          导出备份
          <small>JSON</small>
          <ChevronRight size={16} className="chev" />
        </button>
      </div>

      <div className="group">
        <button
          className="row row-button"
          onClick={() => setSheet('privacy')}
        >
          <Shield size={17} strokeWidth={1.6} />
          隐私与可见范围
          <ChevronRight size={16} className="chev" />
        </button>
        <button className="row row-button" onClick={() => setSheet('about')}>
          <Info size={17} strokeWidth={1.6} />
          关于朝暮
          <ChevronRight size={16} className="chev" />
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <p className="footer-note">朝暮 v0.1.0 · 只有我们两个人</p>

      {sheet && (
        <Sheet title={sheetTitles[sheet]} onClose={() => setSheet(null)}>
          <div className="sheet-form">
            {error && <p className="auth-error">{error}</p>}
            {sheet === 'cities' && (
              <>
                {cityDraft.length === 2 && (
                  <>
                    <CityField
                      label="你的城市"
                      value={cityDraft[0]}
                      onChange={(city) =>
                        setCityDraft((prev) => [city, prev[1]])
                      }
                    />
                    <CityField
                      label="她的城市"
                      value={cityDraft[1]}
                      onChange={(city) =>
                        setCityDraft((prev) => [prev[0], city])
                      }
                    />
                  </>
                )}
                <button
                  className="btn-primary"
                  disabled={saving || cityDraft.length !== 2}
                  onClick={() => persist({ cities: cityDraft })}
                >
                  {saving ? '保存中…' : '保存城市'}
                </button>
                <p className="hint">
                  城市用于两地天气和距离计算。输入后要从搜索结果里选中一个，再保存。
                </p>
              </>
            )}

            {sheet === 'anniversary' && (
              <>
                <label className="field">
                  <span>在一起的第一天</span>
                  <input
                    type="date"
                    value={anniversaryDraft.togetherSince}
                    onChange={(event) =>
                      setAnniversaryDraft({
                        ...anniversaryDraft,
                        togetherSince: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>你的生日</span>
                  <input
                    type="date"
                    value={anniversaryDraft.birthdayA}
                    onChange={(event) =>
                      setAnniversaryDraft({
                        ...anniversaryDraft,
                        birthdayA: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>她的生日</span>
                  <input
                    type="date"
                    value={anniversaryDraft.birthdayB}
                    onChange={(event) =>
                      setAnniversaryDraft({
                        ...anniversaryDraft,
                        birthdayB: event.target.value,
                      })
                    }
                  />
                </label>
                <p className="hint">
                  生日先按公历保存；农历生日下一版再加。
                </p>
                <button
                  className="btn-primary"
                  disabled={saving || !anniversaryDraft.togetherSince}
                  onClick={() =>
                    persist({
                      togetherSince: anniversaryDraft.togetherSince,
                      birthdays: [
                        anniversaryDraft.birthdayA || null,
                        anniversaryDraft.birthdayB || null,
                      ],
                    })
                  }
                >
                  {saving ? '保存中…' : '保存纪念日'}
                </button>

                <div className="settings-divider" />
                <p className="sheet-subtitle">自定义纪念日</p>

                <div className="anniversary-list">
                  {anniversaries.length === 0 && (
                    <p className="hint">
                      比如「第一次见面」「领证纪念日」，可以按年重复。
                    </p>
                  )}
                  {anniversaries.map((item) => (
                    <div className="anniversary-item" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {dayjs(item.date).format('YYYY年M月D日')} ·{' '}
                          {item.recurring ? '每年' : '一次'}
                        </span>
                      </div>
                      {item.author.id === user?.id && (
                        <button
                          className="anniversary-delete"
                          aria-label="删除纪念日"
                          onClick={() => removeAnniversary(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="anniversary-form">
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={anniversaryForm.title}
                      maxLength={40}
                      placeholder="第一次见面"
                      onChange={(event) =>
                        setAnniversaryForm({
                          ...anniversaryForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>日期</span>
                    <input
                      type="date"
                      value={anniversaryForm.date}
                      onChange={(event) =>
                        setAnniversaryForm({
                          ...anniversaryForm,
                          date: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="mini-seg" role="radiogroup" aria-label="重复">
                    <button
                      className={anniversaryForm.recurring ? 'on' : ''}
                      onClick={() =>
                        setAnniversaryForm({
                          ...anniversaryForm,
                          recurring: true,
                        })
                      }
                    >
                      每年
                    </button>
                    <button
                      className={!anniversaryForm.recurring ? 'on' : ''}
                      onClick={() =>
                        setAnniversaryForm({
                          ...anniversaryForm,
                          recurring: false,
                        })
                      }
                    >
                      只过一次
                    </button>
                  </div>
                  <button
                    className="btn-primary"
                    disabled={
                      saving ||
                      !anniversaryForm.title.trim() ||
                      !anniversaryForm.date
                    }
                    onClick={addAnniversary}
                  >
                    {saving ? '添加中…' : '添加纪念日'}
                  </button>
                </div>
              </>
            )}

            {sheet === 'meeting' && (
              <>
                <label className="field">
                  <span>下次见面的日期</span>
                  <input
                    type="date"
                    value={meetingDraft}
                    onChange={(event) => setMeetingDraft(event.target.value)}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={saving}
                  onClick={() =>
                    persist({ nextMeeting: meetingDraft || null })
                  }
                >
                  {saving ? '保存中…' : '保存'}
                </button>
                {meetingDraft && (
                  <button
                    className="row row-button sheet-clear"
                    onClick={() => {
                      setMeetingDraft('')
                      persist({ nextMeeting: null })
                    }}
                  >
                    清除日期
                  </button>
                )}
              </>
            )}

            {sheet === 'storage' && (
              <>
                <div className="stat-grid">
                  <div>
                    <span>照片数量</span>
                    <strong>{stats?.count ?? '—'}</strong>
                  </div>
                  <div>
                    <span>占用空间</span>
                    <strong>
                      {stats ? (stats.bytes / 1024 / 1024).toFixed(1) : '—'}
                      <em>MB</em>
                    </strong>
                  </div>
                </div>
                <div className="mini-seg" role="radiogroup" aria-label="原图策略">
                  <button
                    className={keepOriginal ? 'on' : ''}
                    onClick={() => {
                      setKeepOriginalState(true)
                      setKeepOriginal(true)
                    }}
                  >
                    保留原图
                  </button>
                  <button
                    className={!keepOriginal ? 'on' : ''}
                    onClick={() => {
                      setKeepOriginalState(false)
                      setKeepOriginal(false)
                    }}
                  >
                    只存压缩图
                  </button>
                </div>
                <p className="hint">
                  列表和预览始终用压缩图；保留原图时，大图和下载仍是原文件。
                  关掉后只存压缩图，更省空间，但放大和打印会丢细节。
                </p>
              </>
            )}

            {sheet === 'privacy' && (
              <p className="info-text">
                这个站点只有两个账号。标记为「仅自己」的记录在服务端就会被过滤，
                对方接口里不会出现，照片请求也会被拒绝。
                <br />
                <br />
                心事信箱在 23:00 之前只返回「已封存」，正文不会下发；解锁后才可见。
                照片和语音都存在私有 R2 桶，只能通过带登录会话的地址读取。
              </p>
            )}

            {sheet === 'about' && (
              <p className="info-text">
                朝暮 v0.1.0 · 两个人的私密站点。
                <br />
                <br />
                前端 React + Vite，后端 Cloudflare Workers + D1 + R2。
                代码在本地，部署后数据只存在你们的 Cloudflare 账号里。
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
