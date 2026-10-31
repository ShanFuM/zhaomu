import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import PhotoViewer from '../components/PhotoViewer'
import { api, type ApiPhoto } from '../lib/api'
import { monthLabel } from '../lib/date'
import { isHeicImage } from '../lib/image'
import { makePreview } from '../lib/compressImage'

export default function Album() {
  const [photos, setPhotos] = useState<ApiPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(0)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true

    api
      .album()
      .then((result) => {
        if (alive) setPhotos(result.photos)
      })
      .catch(() => {
        if (alive) setError('相册加载失败，请刷新重试')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const openPicker = () => inputRef.current?.click()
    window.addEventListener('zhaomu:add-photo', openPicker)
    return () => window.removeEventListener('zhaomu:add-photo', openPicker)
  }, [])

  const months = useMemo(() => {
    const map = new Map<string, ApiPhoto[]>()
    for (const photo of photos) {
      const key = dayjs(photo.takenAt).format('YYYY-MM')
      const bucket = map.get(key)
      if (bucket) bucket.push(photo)
      else map.set(key, [photo])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [photos])

  const flatPhotos = useMemo(
    () => months.flatMap(([, list]) => list),
    [months],
  )

  const deletePhoto = async (index: number) => {
    const photo = flatPhotos[index]
    if (!photo || !photo.standalone || !photo.mine) return
    if (!window.confirm('删除这张照片？删除后无法恢复。')) return

    try {
      await api.deleteMedia(photo.id)
      setPhotos((prev) => prev.filter((item) => item.id !== photo.id))
      setViewerIndex(null)
    } catch {
      setError('删除失败，请稍后重试')
    }
  }

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])].filter((file) =>
      file.type.startsWith('image/'),
    )
    event.target.value = ''
    if (picked.length === 0) return

    const files = picked.filter((file) => !isHeicImage(file))
    setUploading(files.length)
    setError(
      files.length < picked.length
        ? 'HEIC 照片暂时无法显示，请用兼容格式或截图上传'
        : '',
    )
    if (files.length === 0) return

    try {
      const uploaded: ApiPhoto[] = []
      for (const file of files) {
        const preview = await makePreview(file)
        const media = await api.upload(file, preview)
        uploaded.push({
          id: media.id,
          url: media.url,
          previewUrl: media.previewUrl,
          mime: media.mime,
          takenAt: new Date().toISOString(),
          standalone: true,
          mine: true,
        })
      }
      setPhotos((prev) => [...uploaded, ...prev])
    } catch {
      setError('上传失败，请检查图片大小后重试')
    } finally {
      setUploading(0)
    }
  }

  return (
    <>
      <h1 className="page-title">相册</h1>
      <p className="page-sub">
        {photos.length} 张照片 · 来自时间轴和愿望
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="添加照片"
        onChange={onPick}
      />

      {uploading > 0 && (
        <p className="upload-banner">正在上传 {uploading} 张照片…</p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {loading && <p className="empty">正在加载…</p>}
      {!loading && photos.length === 0 && (
        <p className="empty">还没有照片，点右下角加一张。</p>
      )}

      {months.map(([key, list]) => (
        <section className="month" key={key}>
          <div className="month-head">
            <h2>{monthLabel(`${key}-01`)}</h2>
            <span>{list.length} 张</span>
          </div>
          <div className="album-grid">
            {list.map((photo) => (
              <button
                className="album-item"
                key={photo.id}
                aria-label="查看照片"
                onClick={() => {
                  const index = flatPhotos.findIndex((item) => item.id === photo.id)
                  setViewerIndex(index >= 0 ? index : 0)
                }}
              >
                <img src={photo.previewUrl} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="footer-note">
        列表用压缩预览，原图可在设置里选择是否保留
      </p>
      <div className="fab-space" />

      {viewerIndex !== null && (
        <PhotoViewer
          photos={flatPhotos.map((photo) => ({ src: photo.url }))}
          start={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
          canDelete={Boolean(
            flatPhotos[viewerIndex]?.standalone && flatPhotos[viewerIndex]?.mine,
          )}
          onDelete={deletePhoto}
        />
      )}
    </>
  )
}
