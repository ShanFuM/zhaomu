export type Mode = 'light' | 'dark' | 'auto'

export const MODE_KEY = 'zhaomu-mode'

export const isDarkAt = (mode: Mode, date = new Date()) => {
  if (mode === 'dark') return true
  if (mode === 'auto') {
    const hour = date.getHours()
    return hour >= 20 || hour < 7
  }
  return false
}

export const getSavedMode = (): Mode => {
  try {
    const value = localStorage.getItem(MODE_KEY)
    if (value === 'dark' || value === 'auto') return value
  } catch {
    /* 隐私模式下忽略 */
  }
  return 'light'
}

export const applyMode = (mode: Mode, date = new Date()) => {
  const root = document.documentElement
  const dark = isDarkAt(mode, date)

  if (dark) root.setAttribute('data-mode', 'dark')
  else root.removeAttribute('data-mode')
  root.style.colorScheme = dark ? 'dark' : 'light'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim()
    if (paper) meta.setAttribute('content', paper)
  }
}
