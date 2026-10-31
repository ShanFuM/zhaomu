const KEY = 'zhaomu:keep-original'

export function getKeepOriginal() {
  try {
    const value = localStorage.getItem(KEY)
    if (value === null) return true
    return value === '1'
  } catch {
    return true
  }
}

export function setKeepOriginal(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    /* 隐私模式下忽略 */
  }
}
