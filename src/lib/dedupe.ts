import type { Expense, ExtractedLine } from '../types'
import { normalizeArabic, similarity } from './utils'

/** حدود القرار في كشف التكرار */
const NAME_MATCH = 0.82
const COST_TOLERANCE = 0.02 // 2%

/** بصمة البند: الاسم المطبّع + التاريخ + السعر + الكمية */
export function fingerprintOf(input: {
  itemName: string
  date: string
  unitCost: number
  quantity: number
}): string {
  return [
    normalizeArabic(input.itemName),
    input.date,
    Math.round(input.unitCost * 100),
    Math.round(input.quantity * 100),
  ].join('|')
}

function costsMatch(a: number, b: number): boolean {
  if (a === b) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  if (base === 0) return true
  return Math.abs(a - b) / base <= COST_TOLERANCE
}

export interface DuplicateHit {
  expenseId: string
  reason: string
  /** درجة الثقة من 0 إلى 1 */
  confidence: number
}

/** البحث عن مصروف مطابق لبند جديد داخل قائمة المصاريف الحالية */
export function findDuplicate(
  candidate: { itemName: string; date: string; unitCost: number; quantity: number },
  expenses: Expense[],
): DuplicateHit | null {
  const fp = fingerprintOf(candidate)

  const exact = expenses.find((e) => e.fingerprint === fp)
  if (exact) {
    return {
      expenseId: exact.id,
      reason: 'بند مطابق تماماً (نفس الاسم والتاريخ والسعر والكمية)',
      confidence: 1,
    }
  }

  let best: DuplicateHit | null = null
  for (const e of expenses) {
    if (e.date !== candidate.date) continue
    if (!costsMatch(e.unitCost, candidate.unitCost)) continue
    const nameScore = similarity(e.itemName, candidate.itemName)
    if (nameScore < NAME_MATCH) continue
    const confidence = nameScore * 0.9
    if (!best || confidence > best.confidence) {
      best = {
        expenseId: e.id,
        reason: `يشبه بند «${e.itemName}» بنفس التاريخ وبسعر مقارب`,
        confidence,
      }
    }
  }
  return best
}

/**
 * وسم البنود المستخرجة من الفاتورة:
 * 1) مقارنتها بالمصاريف المسجّلة سابقاً.
 * 2) مقارنة البنود ببعضها لمنع تكرار نفس السطر داخل الفاتورة الواحدة.
 * البنود المشتبه في تكرارها تُستبعد من التحديد تلقائياً ليراجعها المستخدم.
 */
export function markDuplicates(lines: ExtractedLine[], expenses: Expense[]): ExtractedLine[] {
  const seen = new Map<string, ExtractedLine>()

  return lines.map((line) => {
    const hit = findDuplicate(line, expenses)
    if (hit) {
      return {
        ...line,
        selected: false,
        duplicateOf: hit.expenseId,
        duplicateReason: hit.reason,
      }
    }

    const fp = fingerprintOf(line)
    const twin = seen.get(fp)
    if (twin) {
      return {
        ...line,
        selected: false,
        duplicateOf: twin.tempId,
        duplicateReason: 'سطر مكرر داخل نفس الفاتورة',
      }
    }
    seen.set(fp, line)
    return { ...line, selected: true, duplicateOf: undefined, duplicateReason: undefined }
  })
}

/** بصمة الملف نفسه — لكشف رفع نفس صورة الفاتورة مرتين */
export async function hashBlob(blob: Blob): Promise<string> {
  try {
    const buf = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return `${blob.size}-${blob.type}`
  }
}
