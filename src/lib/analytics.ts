import type { Category, Expense, Funder, Receipt } from '../types'
import { normalizeArabic } from './utils'

export const lineTotal = (e: Expense): number => e.unitCost * e.quantity

export const sumExpenses = (expenses: Expense[]): number =>
  expenses.reduce((s, e) => s + lineTotal(e), 0)

export interface CategoryStat {
  category: Category
  total: number
  count: number
  planned: number
  variance: number
  /** نسبة الاستهلاك من الميزانية المخططة */
  usage: number | null
  share: number
}

export function categoryStats(expenses: Expense[], categories: Category[]): CategoryStat[] {
  const grand = sumExpenses(expenses)
  return categories
    .map((category) => {
      const items = expenses.filter((e) => e.categoryId === category.id)
      const total = sumExpenses(items)
      const planned = category.plannedBudget ?? 0
      return {
        category,
        total,
        count: items.length,
        planned,
        variance: planned - total,
        usage: planned > 0 ? total / planned : null,
        share: grand > 0 ? total / grand : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface MonthStat {
  month: string
  total: number
  count: number
}

export function monthlyStats(expenses: Expense[]): MonthStat[] {
  const map = new Map<string, MonthStat>()
  for (const e of expenses) {
    const month = e.date.slice(0, 7)
    if (!month) continue
    const row = map.get(month) ?? { month, total: 0, count: 0 }
    row.total += lineTotal(e)
    row.count += 1
    map.set(month, row)
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export interface Filters {
  query: string
  categoryIds: string[]
  from: string
  to: string
  minCost: string
  maxCost: string
  onlyWithReceipt: boolean
  sort: 'date-desc' | 'date-asc' | 'cost-desc' | 'cost-asc' | 'name-asc'
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  categoryIds: [],
  from: '',
  to: '',
  minCost: '',
  maxCost: '',
  onlyWithReceipt: false,
  sort: 'date-desc',
}

/**
 * بحث شامل: يغطي اسم البند، الملاحظات، المورد، اسم البند التصنيفي،
 * وبيانات الفاتورة المرفقة (اسم الملف والمورد والنص المستخرج).
 */
export function filterExpenses(
  expenses: Expense[],
  filters: Filters,
  categories: Category[],
  receipts: Receipt[],
): Expense[] {
  const q = normalizeArabic(filters.query)
  const tokens = q ? q.split(' ').filter(Boolean) : []
  const catById = new Map(categories.map((c) => [c.id, c]))
  const receiptById = new Map(receipts.map((r) => [r.id, r]))
  const min = filters.minCost ? Number(filters.minCost) : null
  const max = filters.maxCost ? Number(filters.maxCost) : null

  const result = expenses.filter((e) => {
    if (filters.categoryIds.length && !filters.categoryIds.includes(e.categoryId)) return false
    if (filters.from && e.date < filters.from) return false
    if (filters.to && e.date > filters.to) return false
    if (filters.onlyWithReceipt && !e.receiptId) return false
    const total = lineTotal(e)
    if (min != null && Number.isFinite(min) && total < min) return false
    if (max != null && Number.isFinite(max) && total > max) return false

    if (!tokens.length) return true
    const receipt = e.receiptId ? receiptById.get(e.receiptId) : undefined
    const haystack = normalizeArabic(
      [
        e.itemName,
        e.notes ?? '',
        e.vendor ?? '',
        e.unit,
        e.date,
        catById.get(e.categoryId)?.name ?? '',
        receipt?.fileName ?? '',
        receipt?.vendor ?? '',
        receipt?.rawText ?? '',
      ].join(' '),
    )
    return tokens.every((t) => haystack.includes(t))
  })

  const sorted = [...result]
  switch (filters.sort) {
    case 'date-asc':
      sorted.sort((a, b) => a.date.localeCompare(b.date))
      break
    case 'cost-desc':
      sorted.sort((a, b) => lineTotal(b) - lineTotal(a))
      break
    case 'cost-asc':
      sorted.sort((a, b) => lineTotal(a) - lineTotal(b))
      break
    case 'name-asc':
      sorted.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ar'))
      break
    default:
      sorted.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }
  return sorted
}

export function toCsv(expenses: Expense[], categories: Category[]): string {
  const catById = new Map(categories.map((c) => [c.id, c.name]))
  const head = ['التاريخ', 'البند', 'التصنيف', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي', 'المورد', 'ملاحظات']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const rows = expenses.map((e) =>
    [
      e.date,
      e.itemName,
      catById.get(e.categoryId) ?? '',
      e.quantity,
      e.unit,
      e.unitCost,
      lineTotal(e),
      e.vendor ?? '',
      e.notes ?? '',
    ]
      .map(esc)
      .join(','),
  )
  // BOM لضمان ظهور العربية بشكل صحيح في Excel
  return `﻿${head.map(esc).join(',')}\n${rows.join('\n')}`
}

/**
 * توزيع خصم الفاتورة على بنودها بالتناسب.
 * الفواتير كثيراً ما تعرض سعر كل صنف كاملاً ثم تخصم من الإجمالي؛
 * بدون التوزيع تكون البنود المسجّلة أغلى من المدفوع فعلياً.
 *
 * @param lines البنود بسعر الوحدة قبل الخصم
 * @param finalTotal المبلغ المدفوع فعلياً بعد الخصم
 * @returns معامل الخصم وسعر كل وحدة بعده
 */
export function distributeDiscount<T extends { unitCost: number; quantity: number }>(
  lines: T[],
  finalTotal: number,
): { factor: number; lines: Array<T & { discountedUnitCost: number }> } {
  const gross = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0)
  const factor = gross > 0 && finalTotal > 0 ? finalTotal / gross : 1

  return {
    factor,
    lines: lines.map((l) => ({
      ...l,
      // التقريب لقرشين حتى لا تتضخّم فروق الكسور عبر عشرات البنود
      discountedUnitCost: Math.round(l.unitCost * factor * 100) / 100,
    })),
  }
}

/* ------------------------------------------------------------------ */
/* مصادر التمويل                                                       */
/* ------------------------------------------------------------------ */

export interface FunderStat {
  funder: Funder
  /** ما وضعه هذا الشخص */
  reserve: number
  /** ما صُرف من رصيده */
  spent: number
  /** المتبقي له (قد يكون سالباً عند تجاوز الاحتياطي) */
  remaining: number
  count: number
  /** نسبة الاستهلاك من الاحتياطي */
  usage: number | null
}

export function funderStats(expenses: Expense[], funders: Funder[]): FunderStat[] {
  return funders.map((funder) => {
    const items = expenses.filter((e) => e.funderId === funder.id)
    const spent = sumExpenses(items)
    return {
      funder,
      reserve: funder.reserve,
      spent,
      remaining: funder.reserve - spent,
      count: items.length,
      usage: funder.reserve > 0 ? spent / funder.reserve : null,
    }
  })
}

/** مصاريف لم يُحدَّد مصدر تمويلها — تُعرض حتى لا تختفي من الحساب */
export function unassignedExpenses(expenses: Expense[], funders: Funder[]): Expense[] {
  const ids = new Set(funders.map((f) => f.id))
  return expenses.filter((e) => !e.funderId || !ids.has(e.funderId))
}
