import dayjs from 'dayjs'
import { ImagePlus, Lock, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { api, type ApiEntry } from '../lib/api'
import type { Entry } from '../data/mock'
import PhotoViewer from '../components/PhotoViewer'
import VoiceInput from '../components/VoiceInput'
import type { VoiceValue } from '../components/VoiceInput'
import VoicePlayer from '../components/VoicePlayer'
import { dayDate, dayLabel } from '../lib/date'
import { isHeicImage } from '../lib/image'
import { makePreview } from '../lib/compressImage'

type Filter = 'all' | 'photo' | 'private'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'photo', label: '有照片' },
  { key: 'private', label: '仅自己' },
]

const MOODS = ['🌿', '☀️', '🌤️', '🌧️', '🌙', '❤️']

function toView(entry: ApiEntry): Entry {
  const images = entry.media.filter((media) => media.kind === 'image')

  return {
    id: entry.id,
    at: entry.createdAt,
    text: entry.body,
    mood: entry.mood ?? undefined,
    weather: entry.weather ?? undefined,
    location: entry.location ?? undefined,
    tags: entry.private ? ['仅自己'] : [],
    photos: images.map((media) => `/media/${media.id}`),
    photoThumbs: images.map(
      (media) => media.previewUrl ?? `/media/${media.id}`,
    ),
    voices: entry.media
      .filter((media) => media.kind === 'audio')
      .map((media) => `/media/${media.id}`),
    private: entry.private,
    author: entry.author,
  }
}

function EntryCard({
  entry,
  canDelete,
  onDelete,
  onOpenPhoto,
}: {
  entry: Entry
  canDelete: boolean
  onDelete: () => void
  onOpenPhoto: (photos: string[], index: number) => void
}) {
  const photos = entry.photos ?? []
  const thumbs = entry.photoThumbs ?? photos
  const grid = photos.length >= 3 ? 'three' : photos.length === 2 ? 'two' : 'one'

  return (
    <div className="entry">
      <div className="entry-time">{dayjs(entry.at).format('HH:mm')}</div>
      <article className={`entry-card${entry.private ? ' private' : ''}`}>
        <p className="entry-text">{entry.text}</p>
        {photos.length > 0 && (
          <div className={`photos ${grid}`}>
            {photos.map((src, index) => (
              <button
                key={src}
                className="photo-btn"
                aria-label={`查看第 ${index + 1} 张照片`}
                onClick={() => onOpenPhoto(photos, index)}
              >
                <img src={thumbs[index] ?? src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {(entry.voices ?? []).length > 0 && (
          <div className="voice-list">
            {(entry.voices ?? []).map((src) => (
              <VoicePlayer key={src} src={src} />
            ))}
          </div>
        )}
        <div className="entry-meta">
          {entry.private && (
            <span className="meta lock">
              <Lock size={10} /> 仅自己可见
            </span>
          )}
          {entry.mood && <span className="meta">{entry.mood}</span>}
          {entry.weather && <span className="meta">{entry.weather}</span>}
          {entry.location && <span className="meta">{entry.location}</span>}
          {entry.tags.map((tag) => (
            <span className="meta" key={tag}>
              #{tag}
            </span>
          ))}
          {canDelete && (
            <button
              className="meta-delete"
              aria-label="删除这条记录"
              onClick={onDelete}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </article>
    </div>
  )
}

export default function Timeline() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [mood, setMood] = useState(MOODS[0])
  const [onlyMe, setOnlyMe] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([])
  const [voice, setVoice] = useState<VoiceValue | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(
    null,
  )
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true

    api
      .entries()
      .then((result) => {
        if (alive) setItems(result.entries.map(toView))
      })
      .catch(() => {
        if (alive) setLoadError('加载失败，请刷新页面重试')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const openSheet = () => setOpen(true)
    window.addEventListener('zhaomu:add-entry', openSheet)
    return () => window.removeEventListener('zhaomu:add-entry', openSheet)
  }, [])

  useEffect(() => {
    if (!open) return

    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const groups = useMemo(() => {
    const list = items.filter((entry) => {
      if (filter === 'photo') return (entry.photos ?? []).length > 0
      if (filter === 'private') return entry.private
      return true
    })
    const map = new Map<string, Entry[]>()
    for (const entry of list) {
      const key = dayjs(entry.at).format('YYYY-MM-DD')
      const bucket = map.get(key)
      if (bucket) bucket.push(entry)
      else map.set(key, [entry])
    }
    return [...map.entries()]
  }, [items, filter])

  const save = async () => {
    const value = text.trim()
    if (!value || saving) return

    setSaving(true)
    setSaveError('')

    try {
      const created = await api.createEntry({
        text: value,
        mood,
        private: onlyMe,
        mediaIds: [
          ...photos.map((photo) => photo.id),
          ...(voice ? [voice.id] : []),
        ],
      })

      setItems((prev) => [toView(created.entry), ...prev])
      setText('')
      setMood(MOODS[0])
      setOnlyMe(false)
      setPhotos([])
      setVoice(null)
      setOpen(false)

      api
        .entries()
        .then((fresh) => setItems(fresh.entries.map(toView)))
        .catch(() => {})
    } catch {
      setSaveError('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return

    setUploading(true)
    setSaveError('')

    try {
      const next = [...photos]
      for (const file of files.slice(0, 9 - photos.length)) {
        const preview = await makePreview(file)
        const media = await api.upload(file, preview)
        next.push({ id: media.id, url: media.previewUrl })
      }
      setPhotos(next)
    } catch {
      setSaveError('照片上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  const onPickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])].filter((file) =>
      file.type.startsWith('image/'),
    )
    event.target.value = ''

    const files = picked.filter((file) => !isHeicImage(file))
    if (files.length < picked.length) {
      setSaveError('HEIC 照片暂时无法显示，请用兼容格式或截图上传')
    }

    void uploadFiles(files)
  }

  const removeEntry = async (entry: Entry) => {
    if (!window.confirm('删除这条记录？记录里的照片也会一起删除。')) return

    try {
      await api.deleteEntry(entry.id)
      setItems((prev) => prev.filter((item) => item.id !== entry.id))
    } catch {
      setLoadError('删除失败，请稍后重试')
    }
  }

  return (
    <>
      <h1 className="page-title">时间轴</h1>
      <p className="page-sub">
        已经写下 {items.length} 条，照片会自动进入相册
      </p>

      <div className="filters" role="tablist" aria-label="筛选记录">
        {filters.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={filter === item.key}
            className={`filter${filter === item.key ? ' on' : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <p className="empty">正在加载…</p>}
      {loadError && <p className="empty">{loadError}</p>}
      {!loading && !loadError && groups.length === 0 && (
        <p className="empty">还没有记录，写下第一条吧。</p>
      )}

      {groups.map(([date, list]) => (
        <section className="day" key={date}>
          <div className="day-head">
            <strong>{dayLabel(date)}</strong>
            <span>{dayDate(date)}</span>
          </div>
          {list.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              canDelete={Boolean(user && entry.author?.id === user.id)}
              onDelete={() => removeEntry(entry)}
              onOpenPhoto={(photos, index) => setViewer({ photos, index })}
            />
          ))}
        </section>
      ))}

      <div className="fab-space" />

      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="写一条记录"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-grab" />
              <div className="sheet-head">
                <h2>写一条记录</h2>
                <button
                  className="sheet-close"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <textarea
                className="sheet-text"
                placeholder="今天发生了什么？"
                value={text}
                maxLength={1000}
                onChange={(event) => setText(event.target.value)}
              />

              <div className="compose-photos">
                {photos.map((photo) => (
                  <div className="compose-thumb" key={photo.id}>
                    <img src={photo.url} alt="" />
                    <button
                      className="compose-remove"
                      aria-label="移除照片"
                      onClick={() =>
                        setPhotos((prev) =>
                          prev.filter((item) => item.id !== photo.id),
                        )
                      }
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {photos.length < 9 && (
                  <button
                    className="compose-add"
                    aria-label="添加照片"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus size={20} strokeWidth={1.6} />
                    <span>{uploading ? '上传中' : '照片'}</span>
                  </button>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickFiles}
              />

              <VoiceInput
                value={voice}
                onChange={setVoice}
                onUploading={setVoiceBusy}
              />

              <div className="sheet-moods" aria-label="心情">
                {MOODS.map((item) => (
                  <button
                    key={item}
                    className={`sheet-mood${mood === item ? ' on' : ''}`}
                    aria-label={`心情 ${item}`}
                    aria-pressed={mood === item}
                    onClick={() => setMood(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="sheet-row">
                <span>可见范围</span>
                <div className="mini-seg" role="radiogroup" aria-label="可见范围">
                  <button
                    className={!onlyMe ? 'on' : ''}
                    aria-checked={!onlyMe}
                    role="radio"
                    onClick={() => setOnlyMe(false)}
                  >
                    两人
                  </button>
                  <button
                    className={onlyMe ? 'on' : ''}
                    aria-checked={onlyMe}
                    role="radio"
                    onClick={() => setOnlyMe(true)}
                  >
                    仅自己
                  </button>
                </div>
              </div>

              {saveError && <p className="auth-error">{saveError}</p>}

              <button
                className="btn-primary"
                disabled={!text.trim() || saving || uploading || voiceBusy}
                onClick={save}
              >
                {saving
                  ? '保存中…'
                  : voiceBusy
                    ? '语音处理中…'
                    : uploading
                      ? '上传中…'
                      : '保存'}
              </button>
            </div>
          </div>,
          document.body,
        )}

      {viewer && (
        <PhotoViewer
          photos={viewer.photos.map((src) => ({ src }))}
          start={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  )
}
