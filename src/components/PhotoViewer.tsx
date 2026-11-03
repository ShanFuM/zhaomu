import { ChevronLeft, ChevronRight, Download, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

export interface ViewerPhoto {
  src: string
  previewSrc?: string
  alt?: string
}

interface Gesture {
  id: number
  x: number
  y: number
  time: number
  axis: 'x' | 'y' | null
}

function extensionOf(type: string) {
  const base = type.split(';')[0].trim().toLowerCase()
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  }
  return extensions[base] ?? 'jpg'
}

interface PhotoViewerProps {
  photos: ViewerPhoto[]
  start: number
  onClose: () => void
  onIndexChange?: (index: number) => void
  onDelete?: (index: number) => void
  canDelete?: boolean
}

export default function PhotoViewer({
  photos,
  start,
  onClose,
  onIndexChange,
  onDelete,
  canDelete,
}: PhotoViewerProps) {
  const [index, setIndex] = useState(start)
  const [drag, setDrag] = useState(0)
  const [direction, setDirection] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)
  const gestureRef = useRef<Gesture | null>(null)
  const photo = photos[index]

  const go = (step: number) => {
    setDirection(step > 0 ? 1 : -1)
    setIndex((current) => {
      const next = current + step
      if (next < 0 || next >= photos.length) return current
      return next
    })
  }

  useEffect(() => {
    setShowOriginal(false)
    let alive = true
    const image = new Image()
    image.onload = () => {
      if (alive) setShowOriginal(true)
    }
    image.src = photo.src

    return () => {
      alive = false
      image.onload = null
    }
  }, [photo.src])

  useEffect(() => {
    const neighbours = [index - 1, index + 1]
    for (const position of neighbours) {
      const item = photos[position]
      if (item) {
        const image = new Image()
        image.src = item.previewSrc ?? item.src
      }
    }
  }, [index, photos])

  useEffect(() => {
    onIndexChange?.(index)
  }, [index, onIndexChange])

  useEffect(() => {
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    gestureRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      axis: null,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* 老浏览器仍能收到 stage 内的 move/up */
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return

    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y

    if (!gesture.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y'
    }
    if (gesture.axis !== 'x') return

    const atStart = index === 0 && dx > 0
    const atEnd = index === photos.length - 1 && dx < 0
    const next = atStart || atEnd ? dx * 0.3 : dx
    setDrag(Math.max(-200, Math.min(200, next)))
  }

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    gestureRef.current = null

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* 忽略 */
    }

    const dx = event.clientX - gesture.x
    const elapsed = Math.max(1, performance.now() - gesture.time)
    const velocity = dx / elapsed
    const shouldSwitch =
      commit &&
      gesture.axis === 'x' &&
      (Math.abs(dx) > 36 || Math.abs(velocity) > 0.3)

    if (shouldSwitch) {
      if (dx < 0) go(1)
      else go(-1)
    }
    setDrag(0)
  }

  const cancelGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.id !== event.pointerId) return
    gestureRef.current = null
    setDrag(0)
  }

  if (!photo) return null

  const downloadSrc = photo.src.startsWith('/media/')
    ? `${photo.src}?download=1`
    : photo.src

  const downloadPhoto = async () => {
    if (downloading) return
    setDownloading(true)
    setDownloadError('')

    try {
      const response = await fetch(downloadSrc, { credentials: 'include' })
      if (!response.ok) throw new Error('download_failed')

      const blob = await response.blob()
      if (blob.size === 0) throw new Error('empty_file')

      const type =
        blob.type || response.headers.get('content-type') || 'image/jpeg'
      const extension = extensionOf(type)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `zhaomu-${index + 1}.${extension}`
      anchor.rel = 'noopener'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000)
    } catch {
      setDownloadError('下载失败，请检查网络后重试')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label="查看照片">
      <div className="viewer-top">
        <span className="viewer-count">
          {index + 1} / {photos.length}
        </span>
        <div className="viewer-actions">
          {canDelete && onDelete && (
            <button
              className="viewer-btn"
              aria-label="删除照片"
              onClick={() => onDelete(index)}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            className="viewer-btn"
            aria-label="下载原图"
            disabled={downloading}
            onClick={downloadPhoto}
          >
            <Download size={19} />
          </button>
          <button className="viewer-btn" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endGesture(event, true)}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          key={index}
          className="viewer-frame"
          data-dir={direction}
          style={{
            transform: drag === 0 ? undefined : `translateX(${drag}px)`,
            transition: drag === 0 ? 'transform 0.2s ease' : 'none',
          }}
        >
          <img
            className="viewer-img"
            src={showOriginal ? photo.src : (photo.previewSrc ?? photo.src)}
            alt={photo.alt ?? '照片'}
            draggable={false}
          />
        </div>
      </div>

      {photos.length > 1 && (
        <>
          <button
            className="viewer-arrow left"
            aria-label="上一张"
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            className="viewer-arrow right"
            aria-label="下一张"
            disabled={index === photos.length - 1}
            onClick={() => go(1)}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div className="viewer-hint">左右滑动切换</div>
      {downloadError && (
        <div className="viewer-toast" role="status">
          {downloadError}
        </div>
      )}
    </div>,
    document.body,
  )
}
