import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CategoryStat, MonthStat } from '../lib/analytics'
import { formatMoney, formatMonth, formatNumber } from '../lib/utils'

/**
 * كل الرسوم البيانية في ملف منفصل ليُحمَّل عند الحاجة فقط (lazy)،
 * فتبقى الحزمة الأساسية خفيفة وسريعة الإقلاع على الجوال.
 */
export default function DashboardCharts({
  stats,
  months,
  currency,
}: {
  stats: CategoryStat[]
  months: MonthStat[]
  currency: string
}) {
  const top = stats.slice(0, 7)

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-extrabold">توزيع المصاريف على البنود</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.map((s) => ({
                    name: s.category.name,
                    value: Math.round(s.total),
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {stats.map((s) => (
                    <Cell key={s.category.id} fill={s.category.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [formatMoney(v, currency), n]}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  verticalAlign="bottom"
                  height={56}
                  formatter={(v: string) => <span className="text-xs font-bold">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-extrabold">الأعلى صرفاً</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top.map((s) => ({
                  name: shortLabel(s.category.name),
                  fullName: s.category.name,
                  value: Math.round(s.total),
                }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  interval={0}
                  height={54}
                  tickMargin={8}
                  stroke="#8591a8"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={64}
                  stroke="#8591a8"
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(133,145,168,.12)' }}
                  formatter={(v: number) => [formatMoney(v, currency), 'الإجمالي']}
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ''
                  }
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {top.map((s) => (
                    <Cell key={s.category.id} fill={s.category.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {months.length > 1 && (
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-extrabold">المصروف على مدار الشهور</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={months.map((m) => ({ name: formatMonth(m.month), value: Math.round(m.total) }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} stroke="#8591a8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={64}
                  stroke="#8591a8"
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(133,145,168,.12)' }}
                  formatter={(v: number) => [formatMoney(v, currency), 'المصروف']}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="value" fill="#3381fb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  )
}

/** اختصار أسماء البنود الطويلة على محور الرسم البياني */
function shortLabel(name: string): string {
  const clean = name.replace(/\s+و.*$/, '')
  return clean.length > 11 ? `${clean.slice(0, 10)}…` : clean
}

const tooltipStyle = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 12px 40px -12px rgba(15,20,32,.35)',
  fontSize: 12,
  fontWeight: 700,
  direction: 'rtl' as const,
  fontFamily: 'Cairo, sans-serif',
  color: '#0f1420',
}
