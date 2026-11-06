export function pronounLabel(value?: string | null) {
  if (value === 'he') return '他'
  if (value === 'she') return '她'
  return 'TA'
}
