import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

function clock(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

let sharedContext: AudioContext | null = null

function audioContext() {
  if (!sharedContext) sharedContext = new AudioContext()
  return sharedContext
}

export default function VoicePlayer({ src }: { src: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const durationRef = useRef(0)
  const playingRef = useRef(false)
  const scrubbingRef = useRef(false)
  const resumeAfterScrubRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const stopSource = () => {
    const source = sourceRef.current
    if (!source) return
    source.onended = null
    try {
      source.stop()
    } catch {
      /* 已经停止 */
    }
    source.disconnect()
    sourceRef.current = null
  }

  const stopTick = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const finish = () => {
    stopSource()
    stopTick()
    playingRef.current = false
    offsetRef.current = 0
    setPlaying(false)
    setCurrent(0)
  }

  const tick = () => {
    if (!playingRef.current) return
    const ctx = audioContext()
    const value = Math.min(
      durationRef.current,
      ctx.currentTime - startedAtRef.current,
    )
    if (value >= durationRef.current - 0.02) {
      finish()
      return
    }
    setCurrent(Math.max(0, value))
    rafRef.current = requestAnimationFrame(tick)
  }

  const playFrom = async (offset: number) => {
    if (!bufferRef.current) return

    try {
      const ctx = audioContext()
      if (ctx.state === 'suspended') await ctx.resume()
    } catch {
      setStatus('error')
      return
    }

    const buffer = bufferRef.current
    if (!buffer) return
    const target = Math.max(0, Math.min(offset, buffer.duration - 0.02))
    stopSource()
    stopTick()

    const ctx = audioContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (sourceRef.current === source) finish()
    }

    startedAtRef.current = ctx.currentTime - target
    sourceRef.current = source
    playingRef.current = true
    offsetRef.current = target
    setCurrent(target)
    setPlaying(true)
    source.start(0, target)
    rafRef.current = requestAnimationFrame(tick)
  }

  const pause = () => {
    if (!playingRef.current) return
    const ctx = audioContext()
    const value = Math.min(
      durationRef.current,
      ctx.currentTime - startedAtRef.current,
    )
    stopSource()
    stopTick()
    playingRef.current = false
    offsetRef.current = Math.max(0, value)
    setPlaying(false)
    setCurrent(offsetRef.current)
  }

  const seek = (value: number) => {
    const target = Math.max(0, Math.min(value, durationRef.current))
    offsetRef.current = target
    setCurrent(target)

    if (!scrubbingRef.current && playingRef.current) {
      void playFrom(target)
    }
  }

  const beginScrub = () => {
    if (scrubbingRef.current || !durationRef.current) return
    scrubbingRef.current = true
    resumeAfterScrubRef.current = playingRef.current
    pause()
  }

  const endScrub = () => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    if (resumeAfterScrubRef.current) {
      resumeAfterScrubRef.current = false
      void playFrom(offsetRef.current)
    }
  }

  const seekFromPointer = (input: HTMLInputElement, clientX: number) => {
    const rect = input.getBoundingClientRect()
    const thumb = 22
    const usable = Math.max(1, rect.width - thumb)
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left - thumb / 2) / usable),
    )
    seek(ratio * durationRef.current)
  }

  const startPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (!durationRef.current) return
    beginScrub()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* 不支持 pointer capture 的浏览器仍可依赖原生滑块 */
    }
    seekFromPointer(event.currentTarget, event.clientX)
  }

  const movePointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (!scrubbingRef.current) return
    seekFromPointer(event.currentTarget, event.clientX)
  }

  const finishPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* 忽略 */
    }
    endScrub()
  }

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setStatus('loading')
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    bufferRef.current = null
    durationRef.current = 0
    playingRef.current = false
    offsetRef.current = 0
    stopSource()
    stopTick()

    const load = async () => {
      try {
        const ctx = audioContext()
        const response = await fetch(src, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('load_failed')
        const data = await response.arrayBuffer()
        const buffer = await ctx.decodeAudioData(data)
        if (cancelled) return
        bufferRef.current = buffer
        durationRef.current = buffer.duration
        setDuration(buffer.duration)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('error')
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
      stopSource()
      stopTick()
      playingRef.current = false
    }
  }, [src])

  useEffect(
    () => () => {
      stopSource()
      stopTick()
    },
    [],
  )

  if (status === 'error') {
    return (
      <div className="voice-player voice-fallback">
        <audio src={src} controls preload="auto" playsInline />
        <span className="voice-time">当前浏览器无法解码，使用系统播放器</span>
      </div>
    )
  }

  return (
    <div className="voice-player">
      <button
        className="voice-play"
        aria-label={playing ? '暂停语音' : '播放语音'}
        onClick={() => {
          if (playingRef.current) pause()
          else void playFrom(offsetRef.current)
        }}
        disabled={status !== 'ready'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>

      <div className="voice-track">
        <input
          className="voice-range"
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(current, duration || 0)}
          disabled={status !== 'ready'}
          aria-label="语音进度"
          onPointerDown={startPointer}
          onPointerMove={movePointer}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onTouchStart={beginScrub}
          onTouchEnd={endScrub}
          onTouchCancel={endScrub}
          onBlur={endScrub}
          onContextMenu={(event) => event.preventDefault()}
          onInput={(event) => seek(Number(event.currentTarget.value))}
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />
        <div className="voice-time">
          <span>{clock(current)}</span>
          <span>
            {status === 'loading'
              ? '加载中…'
              : duration
                ? clock(duration)
                : '--:--'}
          </span>
        </div>
      </div>
    </div>
  )
}
