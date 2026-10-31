import dayjs from 'dayjs'
import { Lock, Mail, PenLine, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type ApiLetter } from '../lib/api'
import VoiceInput from '../components/VoiceInput'
import type { VoiceValue } from '../components/VoiceInput'
import VoicePlayer from '../components/VoicePlayer'
import { dayLabel, hms } from '../lib/date'
import { useNow } from '../lib/useNow'

export default function Mailbox() {
  const now = useNow()
  const [letters, setLetters] = useState<ApiLetter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ApiLetter | null>(null)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<VoiceValue | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let alive = true

    api
      .letters()
      .then((result) => {
        if (alive) setLetters(result.letters)
      })
      .catch(() => {
        if (alive) setError('信箱加载失败，请刷新重试')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open && !selected) return

    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, selected])

  const target = new Date(now)
  target.setHours(23, 0, 0, 0)
  const opened = target.getTime() <= now
  const todayCount = letters.filter((letter) =>
    dayjs(letter.createdAt).isSame(dayjs(), 'day'),
  ).length
  const unread = letters.filter(
    (letter) => !letter.mine && !letter.locked && !letter.readAt,
  ).length

  const wasOpened = useRef(opened)

  useEffect(() => {
    if (opened && !wasOpened.current) {
      api
        .letters()
        .then((result) => setLetters(result.letters))
        .catch(() => {})
    }
    wasOpened.current = opened
  }, [opened])

  const openLetter = async (letter: ApiLetter) => {
    if (!letter.body) return

    setSelected(letter)

    if (!letter.mine && !letter.readAt) {
      try {
        const result = await api.readLetter(letter.id)
        setLetters((prev) =>
          prev.map((item) =>
            item.id === letter.id ? { ...item, readAt: result.readAt } : item,
          ),
        )
        setSelected((prev) =>
          prev && prev.id === letter.id
            ? { ...prev, readAt: result.readAt }
            : prev,
        )
      } catch {
        /* 已读失败不影响阅读 */
      }
    }
  }

  const save = async () => {
    const value = text.trim()
    if ((!value && !voice) || saving) return

    setSaving(true)
    setSaveError('')

    try {
      const result = await api.createLetter(value, voice?.id)
      setLetters((prev) => [result.letter, ...prev])
      setText('')
      setVoice(null)
      setOpen(false)
    } catch {
      setSaveError('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1 className="page-title">心事信箱</h1>
      <p className="page-sub">每天 23:00，两个人的信同时打开</p>

      {error && <p className="auth-error">{error}</p>}
      {loading && <p className="empty">正在加载…</p>}

      <section className="seal-card">
        <div className="seal-icon">
          {opened ? <Mail size={26} /> : <Lock size={26} />}
        </div>
        <div className="seal-title">
          {opened ? '可以拆开了' : '今天的信已封存'}
        </div>
        <div className="seal-sub">
          {opened
            ? '23:00 已过，对方写的话现在能看见了'
            : '在那之前，谁都看不到里面的内容'}
        </div>
        <div className="seal-count">
          {opened ? '已开启' : hms(target.getTime() - now)}
          <small>
            {opened
              ? `今天共 ${todayCount} 封${unread ? ` · ${unread} 未读` : ''}`
              : '距离开启'}
          </small>
        </div>
      </section>

      <button className="btn-primary" onClick={() => setOpen(true)}>
        <PenLine size={17} />
        写一封今晚的信
      </button>

      <div className="rule">
        <Lock size={14} />
        <span>
          23:00 之前写的，到点同时解锁；23:00 之后写的，对方立刻就能看到。
          解锁后不能修改，会一直留在信箱里。
        </span>
      </div>

      <section className="history">
        <div className="section-head">
          <h2>以前的信</h2>
          <span className="meta">{letters.length} 封</span>
        </div>

        {letters.length === 0 && !loading && (
          <p className="empty">还没有信，今晚写第一封吧。</p>
        )}

        {letters.map((letter) => (
          <button
            className="history-row"
            key={letter.id}
            disabled={!letter.body}
            onClick={() => openLetter(letter)}
          >
            <span className="history-date">
              {dayLabel(letter.createdAt)}
            </span>
            <span className="history-preview">
              {letter.locked
                ? `已封存 · ${dayjs(letter.unlockAt).format('HH:mm')} 开启`
                : letter.body || (letter.voice ? '一条语音' : '（空）')}
            </span>
            <span
              className={`history-meta${
                !letter.mine && !letter.locked && !letter.readAt ? ' unread' : ''
              }`}
            >
              {letter.mine
                ? '我写的'
                : letter.locked
                  ? '未解锁'
                  : letter.readAt
                    ? '已读'
                    : '未读'}
            </span>
          </button>
        ))}
      </section>

      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="写一封今晚的信"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-grab" />
              <div className="sheet-head">
                <h2>写一封今晚的信</h2>
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
                placeholder="想对她说的话…"
                value={text}
                maxLength={1000}
                onChange={(event) => setText(event.target.value)}
              />

              <VoiceInput
                value={voice}
                onChange={setVoice}
                onUploading={setVoiceBusy}
              />

              <p className="hint">
                23:00 前写的，到点对方才能看到；23:00 后写的，对方立刻可见。
                文字和语音都是。
              </p>

              {saveError && <p className="auth-error">{saveError}</p>}

              <button
                className="btn-primary"
                disabled={(!text.trim() && !voice) || saving || voiceBusy}
                onClick={save}
              >
                {saving
                  ? '封存中…'
                  : voiceBusy
                    ? '语音处理中…'
                    : '封好，放进信箱'}
              </button>
            </div>
          </div>,
          document.body,
        )}

      {selected &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setSelected(null)}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="信件内容"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-grab" />
              <div className="sheet-head">
                <h2>{selected.mine ? '我写的信' : '她写给你的信'}</h2>
                <button
                  className="sheet-close"
                  aria-label="关闭"
                  onClick={() => setSelected(null)}
                >
                  <X size={18} />
                </button>
              </div>

              {selected.voice && (
                <VoicePlayer src={selected.voice.url} />
              )}
              {selected.body && (
                <p className="letter-detail">{selected.body}</p>
              )}
              <p className="hint">
                写于 {dayjs(selected.createdAt).format('M月D日 HH:mm')} ·{' '}
                {selected.mine
                  ? '只有你们两个人能看见'
                  : selected.readAt
                    ? '已读'
                    : '刚刚拆开'}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
