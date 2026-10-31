import { Mic, Square, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { api } from '../lib/api'
import VoicePlayer from './VoicePlayer'

export interface VoiceValue {
  id: string
  url: string
}

interface VoiceInputProps {
  value: VoiceValue | null
  onChange: (value: VoiceValue | null) => void
  onUploading?: (uploading: boolean) => void
}

export default function VoiceInput({
  value,
  onChange,
  onUploading,
}: VoiceInputProps) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const autoStopRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const secure = window.isSecureContext
  const canRecord =
    secure &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    onUploading?.(uploading || recording)
  }, [onUploading, recording, uploading])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
        recorder.stream.getTracks().forEach((track) => track.stop())
      }
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current)
    },
    [],
  )

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('请选择音频文件')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('语音文件不能超过 20MB')
      return
    }

    setUploading(true)
    setError('')

    try {
      const media = await api.upload(file)
      onChange({ id: media.id, url: media.url })
    } catch {
      setError('语音上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  const startRecording = async () => {
    if (!canRecord || recording || uploading) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const candidates = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
      ]
      const mimeType =
        candidates.find(
          (type) =>
            typeof MediaRecorder.isTypeSupported === 'function' &&
            MediaRecorder.isTypeSupported(type),
        ) ?? ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (timerRef.current) window.clearInterval(timerRef.current)
        if (autoStopRef.current) window.clearTimeout(autoStopRef.current)
        timerRef.current = null
        autoStopRef.current = null
        if (startedAtRef.current) {
          const elapsed = (performance.now() - startedAtRef.current) / 1000
          setSeconds(Math.min(60, Math.floor(elapsed)))
          startedAtRef.current = 0
        }
        setRecording(false)

        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        if (blob.size < 600) {
          setError('录音太短了，再说一句吧')
          return
        }

        const extension = type.includes('mp4')
          ? 'm4a'
          : type.includes('ogg')
            ? 'ogg'
            : 'webm'
        void uploadFile(new File([blob], `voice.${extension}`, { type }))
      }

      recorderRef.current = recorder
      setError('')
      setSeconds(0)
      startedAtRef.current = performance.now()
      setRecording(true)
      recorder.start()
      timerRef.current = window.setInterval(() => {
        if (!startedAtRef.current) return
        const elapsed = (performance.now() - startedAtRef.current) / 1000
        setSeconds(Math.min(60, Math.floor(elapsed)))
      }, 200)
      autoStopRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, 60_000)
    } catch {
      setError('无法使用麦克风，请检查权限，或选择语音文件')
    }
  }

  const stopRecording = () => {
    if (startedAtRef.current) {
      const elapsed = (performance.now() - startedAtRef.current) / 1000
      setSeconds(Math.min(60, Math.floor(elapsed)))
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadFile(file)
  }

  return (
    <div className="voice-box">
      {value ? (
        <div className="voice-row">
          <VoicePlayer src={value.url} />
          <button
            className="voice-remove"
            aria-label="移除语音"
            onClick={() => onChange(null)}
          >
            <X size={13} />
            移除
          </button>
        </div>
      ) : recording ? (
        <div className="voice-row">
          <span className="voice-status">
            <i className="voice-dot" />
            录音中 {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </span>
          <button className="voice-record" onClick={stopRecording}>
            <Square size={13} /> 停止
          </button>
        </div>
      ) : (
        <div className="voice-row">
          {canRecord ? (
            <button className="voice-record" onClick={startRecording}>
              <Mic size={15} /> 录一段语音
            </button>
          ) : (
            <span className="voice-hint">
              {secure
                ? '当前浏览器不支持录音，可以选择一段语音文件'
                : '手机用局域网 IP 打开时浏览器会禁用麦克风；先用系统录音，再选文件'}
            </span>
          )}
          <label className="voice-record">
            <Upload size={14} /> 选语音文件
            <input type="file" accept="audio/*" hidden onChange={onFile} />
          </label>
        </div>
      )}

      {uploading && <p className="hint">语音上传中…</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}
