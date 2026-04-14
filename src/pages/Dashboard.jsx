import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import {
  db,
  customersCol,
  rentalsCol,
  settingsDoc,
  updateTotalTotes,
  onSnapshot,
  query,
  where,
} from '../firebase'

// ── helpers ───────────────────────────────────────────────────
function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(base, n) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

function availabilityColor(available, total) {
  if (total === 0) return '#94a3b8'
  const ratio = available / total
  if (ratio > 0.4) return '#22c55e'
  if (ratio > 0.1) return '#f59e0b'
  return '#ef4444'
}

// ── custom tooltip ────────────────────────────────────────────
function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const { available, rented, total } = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-green-600">{available} available</p>
      <p className="text-gray-500">{rented} rented</p>
      <p className="text-gray-400">Total: {total}</p>
    </div>
  )
}

// ── summary card ──────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  const accentMap = {
    default: 'bg-gray-100 text-gray-600',
    green:   'bg-green-100 text-green-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-700',
  }
  return (
    <div className="card p-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold ${accentMap[accent ?? 'default'].split(' ')[1]}`}>
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

// ── shared schedule list (drop-off or pick-up) ───────────────
function ScheduleList({ rentals, type }) {
  const todayStr = toDateStr(new Date())

  const grouped = {}
  rentals.forEach(r => {
    const date = r[type]?.date
    if (!date) return
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(r)
  })

  const sortedDates = Object.keys(grouped).sort()
  const overdue  = sortedDates.filter(d => d < todayStr)
  const todayArr = sortedDates.filter(d => d === todayStr)
  const upcoming = sortedDates.filter(d => d > todayStr)

  function formatScheduleDate(str) {
    if (str === todayStr) return 'Today'
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
        <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-gray-400">None scheduled</p>
      </div>
    )
  }

  function DateGroup({ date, items, variant }) {
    const dotColor  = variant === 'overdue' ? 'bg-red-400'   : variant === 'today' ? 'bg-amber-400' : 'bg-blue-400'
    const dateColor = variant === 'overdue' ? 'text-red-500' : variant === 'today' ? 'text-amber-600' : 'text-gray-700'
    const bgColor   = variant === 'overdue' ? 'bg-red-50/60' : variant === 'today' ? 'bg-amber-50/60' : ''

    return (
      <div className={`flex gap-3 px-4 py-3 rounded-lg ${bgColor}`}>
        <div className="flex flex-col items-center gap-1.5 w-16 shrink-0 pt-0.5">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-xs font-semibold ${dateColor} text-center leading-tight`}>
            {formatScheduleDate(date)}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          {items.map(r => (
            <div key={r.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900">{r.customerName || 'Unknown'}</span>
                {r[type]?.window && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {r[type].window}
                  </span>
                )}
                <span className="text-xs text-gray-400">{r.toteCount} tote{r.toteCount !== 1 ? 's' : ''}</span>
              </div>
              {r[type]?.address && (
                <p className="text-xs text-gray-400 truncate">{r[type].address}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {overdue.map(d   => <DateGroup key={d} date={d} items={grouped[d]} variant="overdue" />)}
      {todayArr.map(d  => <DateGroup key={d} date={d} items={grouped[d]} variant="today" />)}
      {upcoming.map(d  => <DateGroup key={d} date={d} items={grouped[d]} variant="upcoming" />)}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────
export default function Dashboard() {
  const [totalTotes, setTotalTotes]           = useState(null)
  const [rentals, setRentals]                 = useState([])
  const [editTotalTotes, setEditTotalTotes]   = useState(false)
  const [totalTotesInput, setTotalTotesInput] = useState('')
  const [saving, setSaving]                   = useState(false)

  // live listener: settings
  useEffect(() => {
    const unsub = onSnapshot(settingsDoc, (snap) => {
      const size = snap.exists() ? (snap.data().totalTotes ?? 20) : 20
      setTotalTotes(size)
      setTotalTotesInput(String(size))
    })
    return unsub
  }, [])

  // live listener: active rentals
  useEffect(() => {
    const q = query(rentalsCol, where('status', '==', 'active'))
    const unsub = onSnapshot(q, (snap) => {
      setRentals(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  // ── derived stats for today ───────────────────────────────
  const todayStr = toDateStr(new Date())

  const currentlyRented = rentals.reduce((sum, r) => {
    const start = r.startDate <= todayStr
    const notYetReturned = r.returnDate >= todayStr
    return start && notYetReturned ? sum + (r.toteCount || 0) : sum
  }, 0)

  const availableToday = Math.max(0, (totalTotes ?? 0) - currentlyRented)

  const dueToday = rentals.filter(r => r.returnDate === todayStr)
    .reduce((sum, r) => sum + (r.toteCount || 0), 0)

  // ── 14-day forecast data ──────────────────────────────────
  const forecastData = Array.from({ length: 14 }).map((_, i) => {
    const day = addDays(new Date(), i)
    const dayStr = toDateStr(day)
    const label = i === 0
      ? 'Today'
      : day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    const rented = rentals.reduce((sum, r) => {
      if (r.startDate <= dayStr && r.returnDate >= dayStr) {
        return sum + (r.toteCount || 0)
      }
      return sum
    }, 0)

    const available = Math.max(0, (totalTotes ?? 0) - rented)
    return { label, available, rented, total: totalTotes ?? 0 }
  })

  // ── total totes edit ──────────────────────────────────────
  async function handleTotalTotesSave() {
    const n = parseInt(totalTotesInput, 10)
    if (isNaN(n) || n < 1) return
    setSaving(true)
    await updateTotalTotes(n)
    setSaving(false)
    setEditTotalTotes(false)
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Total totes editor */}
        <div className="flex items-center gap-2">
          {editTotalTotes ? (
            <>
              <input
                type="number"
                min={1}
                className="input w-24 text-center"
                value={totalTotesInput}
                onChange={e => setTotalTotesInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTotalTotesSave()}
                autoFocus
              />
              <button className="btn-primary" onClick={handleTotalTotesSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-secondary" onClick={() => setEditTotalTotes(false)}>Cancel</button>
            </>
          ) : (
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => setEditTotalTotes(true)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit total totes
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total totes"         value={totalTotes}       accent="default" sub="totes owned" />
        <StatCard label="Currently rented"   value={currentlyRented}  accent="amber"   sub="out today" />
        <StatCard label="Available today"    value={availableToday}   accent="green"   sub="ready to rent" />
        <StatCard label="Due back today"     value={dueToday}         accent="red"     sub="totes returning" />
      </div>

      {/* 14-day forecast — full width */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">14-Day Availability Forecast</h2>
        <p className="text-xs text-gray-400 mb-5">Available totes per day based on active rentals</p>

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={forecastData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              domain={[0, (totalTotes ?? 20) + 2]}
            />
            <Tooltip content={<ForecastTooltip />} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="available" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {forecastData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={availabilityColor(entry.available, entry.total)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-5 mt-4 justify-end">
          {[
            { color: '#22c55e', label: 'Good (>40%)' },
            { color: '#f59e0b', label: 'Low (10–40%)' },
            { color: '#ef4444', label: 'Critical (<10%)' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Drop-off + Pick-up schedules side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Drop-off */}
        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-base font-semibold text-gray-900">Drop-off Schedule</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">All scheduled tote deliveries</p>
          <ScheduleList rentals={rentals} type="dropoff" />
        </div>

        {/* Pick-up */}
        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <h2 className="text-base font-semibold text-gray-900">Pick-up Schedule</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">All scheduled tote collections</p>
          <ScheduleList rentals={rentals} type="pickup" />
        </div>

      </div>
    </div>
  )
}
