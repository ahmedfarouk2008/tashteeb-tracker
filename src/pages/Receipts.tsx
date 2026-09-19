import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Receipt } from '../types'
import { getBlob } from '../lib/storage'
import { lineTotal } from '../lib/analytics'
import { formatBytes, formatDate, formatMoney, formatNumber, normalizeArabic } from '../lib/utils'
import { Badge, ConfirmDialog, EmptyState, Modal, useObjectUrl } from '../components/ui'
import { IconGallery, IconSearch, IconSparkles, IconTrash, IconUpload } from '../components/Icons'
import ReceiptScannerModal from '../components/ReceiptScannerModal'

export default function Receipts() {
  const { receipts, expenses, settings, deleteReceipt, notify } = useStore()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [viewing, setViewing] = useState<Receipt | null>(null)
  const [deleting, setDeleting] = useState<Receipt | null>(null)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = normalizeArabic(query)
    if (!q) return receipts
    return receipts.filter((r) =>
      normalizeArabic([r.fileName, r.vendor ?? '', r.rawText ?? '', r.date ?? ''].join(' ')).includes(q),
    )
  }, [receipts, query])

  const linkedExpenses = (id: string) => expenses.filter((e) => e.receiptId === id)

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold">أرشيف الفواتير</h2>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {formatNumber(receipts.length)} فاتورة محفوظة على جهازك
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setScannerOpen(true)}>
          <IconSparkles width={17} height={17} /> مسح فاتورة جديدة
        </button>
      </div>

      {receipts.length > 6 && (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-400">
            <IconSearch width={18} height={18} />
          </span>
          <input
            className="field ps-10"
            placeholder="ابحث في الفواتير بالمورد أو اسم الملف..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث في الفواتير"
          />
        </div>
      )}

      {!receipts.length ? (
        <EmptyState
          icon={<IconGallery width={26} height={26} />}
          title="لا توجد فواتير بعد"
          description="ارفع صورة فاتورة ليقرأها الذكاء الاصطناعي ويستخرج البنود والأسعار تلقائياً، ثم تراجعها قبل الحفظ."
          action={
            <button type="button" className="btn-primary mt-2" onClick={() => setScannerOpen(true)}>
              <IconUpload width={17} height={17} /> رفع أول فاتورة
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((r) => (
            <li key={r.id}>
              <ReceiptCard
                receipt={r}
                itemsCount={linkedExpenses(r.id).length}
                total={linkedExpenses(r.id).reduce((s, e) => s + lineTotal(e), 0)}
                currency={settings.currency}
                onOpen={() => setViewing(r)}
              />
            </li>
          ))}
        </ul>
      )}

      {!!receipts.length && visible.length === 0 && (
        <EmptyState
          icon={<IconSearch width={26} height={26} />}
          title="لا توجد فواتير مطابقة"
          description="جرّب كلمة بحث أخرى."
        />
      )}

      <ReceiptScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />

      {viewing && (
        <ReceiptViewer
          receipt={viewing}
          onClose={() => setViewing(null)}
          onDelete={() => {
            setDeleting(viewing)
            setViewing(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="حذف الفاتورة"
        message={`سيتم حذف صورة الفاتورة «${deleting?.fileName ?? ''}». البنود المرتبطة بها ستبقى مسجّلة بدون صورة.`}
        confirmLabel="حذف الصورة"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            void deleteReceipt(deleting.id, true)
            notify('تم حذف الفاتورة', 'info')
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

function ReceiptCard({
  receipt,
  itemsCount,
  total,
  currency,
  onOpen,
}: {
  receipt: Receipt
  itemsCount: number
  total: number
  currency: string
  onOpen: () => void
}) {
  const url = useObjectUrl(() => getBlob(receipt.blobKey), [receipt.blobKey])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group w-full overflow-hidden text-start transition hover:shadow-pop"
    >
      <div className="relative aspect-[4/5] bg-ink-100 dark:bg-ink-800">
        {url ? (
          <img
            src={url}
            alt={receipt.fileName}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <div className="skeleton h-full w-full rounded-none" />
        )}
        {itemsCount > 0 && (
          <span className="absolute bottom-2 start-2 rounded-lg bg-ink-900/80 px-2 py-1 text-[10px] font-extrabold text-white">
            {itemsCount} بند
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-xs font-extrabold">{receipt.vendor || receipt.fileName}</p>
        <p className="tnum mt-1 text-[11px] font-semibold text-ink-400">
          {receipt.date ? formatDate(receipt.date) : formatDate(receipt.createdAt.slice(0, 10))}
        </p>
        {total > 0 && (
          <p className="tnum mt-1 text-[11px] font-extrabold text-brand-700 dark:text-brand-300">
            {formatMoney(total, currency)}
          </p>
        )}
      </div>
    </button>
  )
}

function ReceiptViewer({
  receipt,
  onClose,
  onDelete,
}: {
  receipt: Receipt
  onClose: () => void
  onDelete: () => void
}) {
  const { expenses, categories, settings } = useStore()
  const url = useObjectUrl(() => getBlob(receipt.blobKey), [receipt.blobKey])
  const linked = expenses.filter((e) => e.receiptId === receipt.id)
  const total = linked.reduce((s, e) => s + lineTotal(e), 0)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={receipt.vendor || receipt.fileName}
      subtitle={`${receipt.date ? formatDate(receipt.date) : ''} · ${formatBytes(receipt.size)}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          {url && (
            <a href={url} download={receipt.fileName} className="btn-outline">
              تنزيل الصورة
            </a>
          )}
          <button type="button" className="btn-danger" onClick={onDelete}>
            <IconTrash width={16} height={16} /> حذف
          </button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {url ? (
            <img
              src={url}
              alt={receipt.fileName}
              className="w-full rounded-2xl border border-ink-200 object-contain dark:border-ink-700"
            />
          ) : (
            <div className="skeleton aspect-[3/4] w-full" />
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={receipt.imported ? 'ok' : 'neutral'}>
              {receipt.imported ? 'تمت إضافة البنود' : 'لم تُضف بنودها'}
            </Badge>
            {receipt.total != null && (
              <Badge tone="info">
                إجمالي مقروء: {formatMoney(receipt.total, settings.currency)}
              </Badge>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-extrabold">
              البنود المرتبطة ({formatNumber(linked.length)})
            </h3>
            {linked.length ? (
              <>
                <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
                  {linked.map((e) => {
                    const cat = categories.find((c) => c.id === e.categoryId)
                    return (
                      <li key={e.id} className="flex items-center gap-2 px-3 py-2.5">
                        <span>{cat?.icon ?? '📦'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{e.itemName}</p>
                          <p className="tnum text-[10px] text-ink-400">
                            {formatNumber(e.quantity)} {e.unit} ×{' '}
                            {formatMoney(e.unitCost, settings.currency)}
                          </p>
                        </div>
                        <span className="tnum text-xs font-extrabold">
                          {formatMoney(lineTotal(e), settings.currency)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="tnum mt-2 text-end text-sm font-extrabold text-brand-700 dark:text-brand-300">
                  الإجمالي: {formatMoney(total, settings.currency)}
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-ink-50 px-3.5 py-4 text-xs font-bold text-ink-500 dark:bg-ink-950 dark:text-ink-400">
                لا توجد بنود مرتبطة بهذه الفاتورة.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
