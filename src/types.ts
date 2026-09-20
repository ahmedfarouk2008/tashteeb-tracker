/** نماذج البيانات الأساسية للتطبيق */

export type ExpenseSource = 'manual' | 'ocr' | 'hybrid'

export interface Category {
  id: string
  /** الاسم بالعربية — هو الاسم المعروض */
  name: string
  /** اسم إنجليزي اختياري يُستخدم في سياق الذكاء الاصطناعي فقط */
  nameEn?: string
  /** رمز تعبيري صغير يمثل البند */
  icon: string
  /** لون HEX يستخدم في الرسوم البيانية والشارات */
  color: string
  /** الميزانية المخططة لهذا البند (اختيارية) */
  plannedBudget?: number
  /** بنود النظام الأساسية لا يمكن حذفها إلا بعد نقل مصاريفها */
  isSystem?: boolean
  createdAt: string
  /** يُستخدم في المزامنة لتحديد أحدث نسخة */
  updatedAt?: string
}

export interface Expense {
  id: string
  itemName: string
  categoryId: string
  /** سعر الوحدة */
  unitCost: number
  quantity: number
  /** وحدة القياس: قطعة / متر / متر مربع / شيكارة ... */
  unit: string
  /** تاريخ الصرف بصيغة YYYY-MM-DD */
  date: string
  notes?: string
  vendor?: string
  receiptId?: string
  source: ExpenseSource
  /** بصمة تستخدم لكشف التكرار */
  fingerprint: string
  createdAt: string
  updatedAt: string
}

export interface Receipt {
  id: string
  fileName: string
  mimeType: string
  /** حجم الملف بالبايت */
  size: number
  /** مفتاح الصورة داخل IndexedDB */
  blobKey: string
  /** بصمة الملف — تمنع رفع نفس الصورة مرتين */
  hash?: string
  vendor?: string
  date?: string
  total?: number
  /** ملخص نصي لما استخرجه الذكاء الاصطناعي */
  rawText?: string
  /** هل تمت معالجة الفاتورة وإضافة بنودها */
  imported: boolean
  createdAt: string
  /** يُستخدم في المزامنة لتحديد أحدث نسخة */
  updatedAt?: string
  /** هل رُفعت الصورة إلى التخزين السحابي */
  uploaded?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** أخطاء الاتصال تُعرض بشكل مختلف */
  isError?: boolean
}

export type MarketVerdict = 'good' | 'fair' | 'high' | 'unknown'

export interface MarketInsight {
  id: string
  expenseId: string
  itemName: string
  paidUnitCost: number
  marketLow: number | null
  marketHigh: number | null
  verdict: MarketVerdict
  summary: string
  tips: string[]
  createdAt: string
}

export interface Settings {
  projectName: string
  currency: string
  totalBudget: number
  /** مفتاح Gemini API — يُحفظ محلياً على جهاز المستخدم فقط */
  apiKey: string
  model: string
  /** المحافظة/المدينة لمقارنة الأسعار بالسوق المحلي */
  region: string
  theme: 'light' | 'dark'
  /** تاريخ آخر نسخة احتياطية — لتذكير المستخدم قبل فقدان البيانات */
  lastBackupAt?: string

  /* ---------------- المزامنة السحابية ---------------- */
  /** رابط مشروع Supabase */
  supabaseUrl?: string
  /** المفتاح العام (anon) — مصمَّم ليكون في المتصفح، والحماية عبر RLS */
  supabaseAnonKey?: string
  /** طابع آخر مزامنة ناجحة — للعرض فقط (بساعة الجهاز) */
  lastSyncAt?: string
  /**
   * مؤشر السحب بساعة **الخادم**: أحدث updated_at وصلنا من Supabase.
   * فصله عن الساعة المحلية يمنع ضياع التغييرات عند اختلاف ساعات الأجهزة.
   */
  syncCursor?: string
  /** مؤشر الرفع بساعة **الجهاز**: يحدد ما تغيّر محلياً منذ آخر رفع */
  lastPushAt?: string
  /** تشغيل المزامنة التلقائية عند كل تغيير */
  autoSync?: boolean
}

/** شاهدة حذف — بدونها لا ينتقل الحذف إلى بقية الأجهزة */
export interface Tombstone {
  kind: SyncKind
  id: string
  deletedAt: string
}

export type SyncKind = 'expense' | 'category' | 'receipt' | 'settings'

export interface AppData {
  version: number
  settings: Settings
  categories: Category[]
  expenses: Expense[]
  receipts: Receipt[]
  chat: ChatMessage[]
  insights: MarketInsight[]
  /** سجل المحذوفات لمزامنتها مع بقية الأجهزة */
  deletions?: Tombstone[]
}

/** بند مستخرج من فاتورة قبل اعتماده */
export interface ExtractedLine {
  /** معرّف مؤقت داخل شاشة المراجعة */
  tempId: string
  itemName: string
  unitCost: number
  quantity: number
  unit: string
  date: string
  categoryId: string
  notes?: string
  vendor?: string
  /** حالة كشف التكرار */
  duplicateOf?: string
  duplicateReason?: string
  /** هل سيتم حفظ هذا البند */
  selected: boolean
  /** عدّل المستخدم هذا السطر يدوياً بعد قراءته من الفاتورة */
  edited: boolean
}

export interface OcrResult {
  vendor?: string
  date?: string
  total?: number
  currency?: string
  notes?: string
  items: Array<{
    itemName: string
    unitCost: number
    quantity: number
    unit?: string
    categoryHint?: string
  }>
}
