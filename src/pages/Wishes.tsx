import dayjs from 'dayjs'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { api, type ApiWish } from '../lib/api'

type Tab = 'todo' | 'done'

const CATEGORIES = ['旅行', '美食', '体验', '生活', '其他']

export default function Wishes() {
  const { user } = useAuth()
  const [wishes, setWishes] = useState<ApiWish[]>([])
  const [tab, setTab] = useState<Tab>('todo')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ApiWish | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [form, setForm] = useState({
    title: '',
    note: '',
    category: '旅行',
    targetDate: '',
  })

  useEffect(() => {
    let alive = true

    api
      .wishes()
      .then((result) => {
        if (alive) setWishes(result.wishes)
      })
      .catch(() => {
        if (alive) setError('愿望清单加载失败，请刷新重试')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
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

  const done = wishes.filter((wish) => wish.done).length
  const list = wishes.filter((wish) => (tab === 'done' ? wish.done : !wish.done))

  const complete = async (wish: ApiWish) => {
    setBusyId(wish.id)
    setError('')

    try {
      const result = await api.updateWish(wish.id, { done: true })
      setWishes((prev) =>
        prev.map((item) => (item.id === wish.id ? result.wish : item)),
      )
    } catch {
      setError('标记完成失败，请重试')
    } finally {
      setBusyId('')
    }
  }

  const remove = async (wish: ApiWish) => {
    if (
      !window.confirm(
        '删除这个愿望？已经生成的回忆会留在时间轴里，不会跟着删除。',
      )
    ) {
      return
    }

    setBusyId(wish.id)
    setError('')

    try {
      await api.deleteWish(wish.id)
      setWishes((prev) => prev.filter((item) => item.id !== wish.id))
    } catch {
      setError('删除失败，请重试')
    } finally {
      setBusyId('')
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', note: '', category: '旅行', targetDate: '' })
    setOpen(true)
  }

  const openEdit = (wish: ApiWish) => {
    setEditing(wish)
    setForm({
      title: wish.title,
      note: wish.note ?? '',
      category: wish.category,
      targetDate: wish.targetDate ?? '',
    })
    setOpen(true)
  }

  const undo = async (wish: ApiWish) => {
    if (
      !window.confirm(
        '撤回后，时间轴里已经生成的回忆会保留。确定撤回吗？',
      )
    ) {
      return
    }

    setBusyId(wish.id)
    setError('')

    try {
      const result = await api.updateWish(wish.id, { done: false })
      setWishes((prev) =>
        prev.map((item) => (item.id === wish.id ? result.wish : item)),
      )
      setTab('todo')
    } catch {
      setError('撤回失败，请重试')
    } finally {
      setBusyId('')
    }
  }

  const create = async () => {
    const title = form.title.trim()
    if (!title || saving) return

    setSaving(true)
    setError('')

    try {
      if (editing) {
        const result = await api.updateWish(editing.id, {
          title,
          note: form.note.trim() || null,
          category: form.category,
          targetDate: form.targetDate || null,
        })
        setWishes((prev) =>
          prev.map((item) => (item.id === editing.id ? result.wish : item)),
        )
      } else {
        const result = await api.createWish({
          title,
          note: form.note.trim() || undefined,
          category: form.category,
          targetDate: form.targetDate || null,
        })
        setWishes((prev) => [result.wish, ...prev])
        setTab('todo')
      }

      setEditing(null)
      setForm({ title: '', note: '', category: '旅行', targetDate: '' })
      setOpen(false)
    } catch {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1 className="page-title">愿望清单</h1>
      <p className="page-sub">想做的事，完成之后会变成回忆</p>

      {error && <p className="auth-error">{error}</p>}

      <section className="progress">
        <div className="progress-top">
          <div>
            <span>已经完成</span>
            <strong>
              {done}
              <span> / {wishes.length}</span>
            </strong>
          </div>
          <span>继续加油</span>
        </div>
        <div className="bar">
          <i
            style={{
              width: wishes.length ? `${(done / wishes.length) * 100}%` : '0%',
            }}
          />
        </div>
      </section>

      <div className="seg" role="tablist" aria-label="愿望状态">
        <button
          role="tab"
          aria-selected={tab === 'todo'}
          className={tab === 'todo' ? 'on' : ''}
          onClick={() => setTab('todo')}
        >
          待实现
        </button>
        <button
          role="tab"
          aria-selected={tab === 'done'}
          className={tab === 'done' ? 'on' : ''}
          onClick={() => setTab('done')}
        >
          已完成
        </button>
      </div>

      {loading && <p className="empty">正在加载…</p>}
      {!loading && list.length === 0 && (
        <p className="empty">
          {tab === 'done' ? '还没有完成的愿望。' : '还没有愿望，许一个吧。'}
        </p>
      )}

      {list.map((wish) => (
        <article className="wish" key={wish.id}>
          <div className="wish-top">
            <span className="wish-cat">{wish.category}</span>
            {wish.done && (
              <span className="done-chip">
                <Check size={12} /> 已变成回忆
              </span>
            )}
            <span className="meta" style={{ marginLeft: 'auto' }}>
              {wish.author.name}
            </span>
          </div>

          <h3>{wish.title}</h3>
          {wish.note && <p>{wish.note}</p>}

          <div className="wish-foot">
            <span>
              {wish.done
                ? `完成于 ${dayjs(wish.doneAt).format('M月D日')}`
                : wish.targetDate
                  ? `目标 ${dayjs(wish.targetDate).format('M月D日')}`
                  : '没有期限'}
            </span>
            <span className="wish-actions">
              {wish.done ? (
                <button
                  className="wish-undo"
                  disabled={busyId === wish.id}
                  onClick={() => undo(wish)}
                >
                  撤回
                </button>
              ) : (
                <button
                  className="wish-complete"
                  disabled={busyId === wish.id}
                  onClick={() => complete(wish)}
                >
                  {busyId === wish.id ? '…' : '完成'}
                </button>
              )}
              {user?.id === wish.author.id && (
                <>
                  <button
                    className="wish-edit"
                    aria-label="编辑愿望"
                    disabled={busyId === wish.id}
                    onClick={() => openEdit(wish)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="wish-delete"
                    aria-label="删除愿望"
                    disabled={busyId === wish.id}
                    onClick={() => remove(wish)}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </span>
          </div>
        </article>
      ))}

      <button className="btn-primary" onClick={openCreate}>
        <Plus size={17} />
        许一个愿
      </button>

      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="许一个愿"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-grab" />
              <div className="sheet-head">
                <h2>{editing ? '编辑愿望' : '许一个愿'}</h2>
                <button
                  className="sheet-close"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="sheet-form">
                {error && <p className="auth-error">{error}</p>}
                <label className="field">
                  <span>想做的事</span>
                  <input
                    value={form.title}
                    maxLength={80}
                    placeholder="比如：一起去看极光"
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                  />
                </label>

                <label className="field">
                  <span>备注（可选）</span>
                  <textarea
                    className="sheet-text"
                    style={{ minHeight: 84 }}
                    value={form.note}
                    maxLength={500}
                    placeholder="想怎么完成它"
                    onChange={(event) =>
                      setForm({ ...form, note: event.target.value })
                    }
                  />
                </label>

                <div className="field">
                  <span>分类</span>
                  <div className="cat-row">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category}
                        className={`filter${form.category === category ? ' on' : ''}`}
                        onClick={() => setForm({ ...form, category })}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span>目标日期（可选）</span>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(event) =>
                      setForm({ ...form, targetDate: event.target.value })
                    }
                  />
                </label>

                <button
                  className="btn-primary"
                  disabled={!form.title.trim() || saving}
                  onClick={create}
                >
                  {saving
                    ? '保存中…'
                    : editing
                      ? '保存修改'
                      : '放进愿望清单'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
