export type PhotoQuality = 'high' | 'raw' | 'preview'

const KEY = 'zhaomu:photo-quality'
const LEGACY_KEY = 'zhaomu:keep-original'

export function getPhotoQuality(): PhotoQuality {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'raw' || value === 'preview' || value === 'high') {
      return value
    }

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === '0') return 'preview'
    return 'high'
  } catch {
    return 'high'
  }
}

export function setPhotoQuality(value: PhotoQuality) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* 隐私模式下忽略 */
  }
}
