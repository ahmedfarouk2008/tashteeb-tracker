/** أدوات عامة: المعرّفات، التنسيق، وتطبيع النص العربي */

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}${prefix ? '_' : ''}${Date.now().toString(36)}${rand}`
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** تحويل الأرقام العربية/الفارسية إلى أرقام لاتينية */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const ar = AR_DIGITS.indexOf(ch)
    if (ar > -1) return String(ar)
    return String(FA_DIGITS.indexOf(ch))
  })
}

/**
 * تطبيع النص العربي لمقارنة أسماء البنود:
 * إزالة التشكيل والتطويل، وتوحيد الألف والهمزة والتاء المربوطة والياء.
 */
export function normalizeArabic(input: string): string {
  if (!input) return ''
  return toLatinDigits(input)
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** مسافة ليفنشتاين — تُستخدم لقياس تشابه أسماء البنود */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[b.length]
}

/** نسبة التشابه بين نصين بعد التطبيع (0 إلى 1) */
export function similarity(a: string, b: string): number {
  const na = normalizeArabic(a)
  const nb = normalizeArabic(b)
  if (!na && !nb) return 1
  const max = Math.max(na.length, nb.length)
  if (max === 0) return 1
  return 1 - levenshtein(na, nb) / max
}

const numberFmt = new Intl.NumberFormat('ar-EG', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return numberFmt.format(value)
}

export function formatMoney(value: number, currency = 'ج.م'): string {
  return `${formatNumber(Math.round(value * 100) / 100)} ${currency}`
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export function formatMonth(iso: string): string {
  const d = new Date(`${iso}-01`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(d)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} بايت`
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024)} ك.ب`
  return `${formatNumber(bytes / (1024 * 1024))} م.ب`
}

/** تحويل رقم قد يكون نصاً عربياً أو يحتوي فواصل إلى رقم */
export function parseNumber(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  if (typeof input !== 'string') return 0
  const cleaned = toLatinDigits(input).replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function downloadFile(content: string, fileName: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
