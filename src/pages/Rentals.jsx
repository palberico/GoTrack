import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  customersCol,
  rentalsCol,
  settingsDoc,
  addRental,
  markReturned,
  onSnapshot,
  query,
  where,
} from '../firebase'

// ── helpers ───────────────────────────────────────────────────
function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}

function formatDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

function totesRentedOn(activeRentals, dateStr) {
  return activeRentals.reduce((sum, r) => {
    if (r.startDate <= dateStr && r.returnDate >= dateStr) {
      return sum + (r.toteCount || 0)
    }
    return sum
  }, 0)
}

// 2-hour time windows from 7 AM to 8 PM
const TIME_WINDOWS = [
  '7:00 AM – 9:00 AM',
  '8:00 AM – 10:00 AM',
  '9:00 AM – 11:00 AM',
  '10:00 AM – 12:00 PM',
  '11:00 AM – 1:00 PM',
  '12:00 PM – 2:00 PM',
  '1:00 PM – 3:00 PM',
  '2:00 PM – 4:00 PM',
  '3:00 PM – 5:00 PM',
  '4:00 PM – 6:00 PM',
  '5:00 PM – 7:00 PM',
  '6:00 PM – 8:00 PM',
]

// ── Section header inside modal ───────────────────────────────
function SectionHeader({ icon, label }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ── Add rental modal ──────────────────────────────────────────
function AddRentalModal({ onClose, customers, activeRentals, totalTotes }) {
  const today = toDateStr(new Date())
  const [form, setForm] = useState({
    customerId:     '',
    toteCount:      '',
    startDate:      today,
    returnDate:     '',
    dropoffAddress: '',
    dropoffDate:    today,
    dropoffWindow:  '',
    pickupAddress:  '',
    pickupDate:     '',
    pickupWindow:   '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) {
    return e => {
      const value = e.target.value
      setForm(f => {
        const next = { ...f, [field]: value }
        // Keep dropoff/pickup dates in sync with rental dates by default
        if (field === 'startDate'  && f.dropoffDate === f.startDate)  next.dropoffDate = value
        if (field === 'returnDate' && f.pickupDate  === f.returnDate) next.pickupDate  = value
        // Auto-fill drop-off address from the selected customer's address
        if (field === 'customerId') {
          const customer = customers.find(c => c.id === value)
          const addr = customer?.address
          if (addr) {
            next.dropoffAddress = [addr.street, addr.city, addr.state, addr.zip]
              .filter(Boolean).join(', ')
          }
        }
        return next
      })
      setError('')
    }
  }

  function availabilityForWindow() {
    if (!form.startDate || !form.returnDate) return null
    let maxUsed = 0
    for (let d = new Date(form.startDate); toDateStr(d) <= form.returnDate; d.setDate(d.getDate() + 1)) {
      const used = totesRentedOn(activeRentals, toDateStr(d))
      if (used > maxUsed) maxUsed = used
    }
    const requested = parseInt(form.toteCount, 10) || 0
    const available = totalTotes - maxUsed
    return { available, requested }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.customerId)                          { setError('Please select a customer.'); return }
    if (!form.toteCount || parseInt(form.toteCount) < 1) { setError('Enter at least 1 tote.'); return }
    if (!form.startDate)                           { setError('Start date is required.'); return }
    if (!form.returnDate)                          { setError('Return date is required.'); return }
    if (form.returnDate < form.startDate)          { setError('Return date must be on or after start date.'); return }

    const avail = availabilityForWindow()
    if (avail && avail.requested > avail.available) {
      setError(`Not enough totes available. Only ${avail.available} free across this period (total: ${totalTotes}).`)
      return
    }

    setSaving(true)
    try {
      const customer = customers.find(c => c.id === form.customerId)
      await addRental({
        customerId:    form.customerId,
        customerName:  customer?.name ?? '',
        toteCount:     parseInt(form.toteCount, 10),
        startDate:     form.startDate,
        returnDate:    form.returnDate,
        dropoff: {
          address: form.dropoffAddress.trim(),
          date:    form.dropoffDate,
          window:  form.dropoffWindow,
        },
        pickup: {
          address: form.pickupAddress.trim(),
          date:    form.pickupDate,
          window:  form.pickupWindow,
        },
      })
      onClose()
    } catch (err) {
      setError('Failed to save. Check your Firebase config.')
      setSaving(false)
    }
  }

  const avail = availabilityForWindow()

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Fixed header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">New Rental</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 flex flex-col gap-4">

          {/* ── Rental details ── */}
          <SectionHeader icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          } label="Rental details" />

          <div>
            <label className="label">Customer *</label>
            <select className="input" value={form.customerId} onChange={set('customerId')}>
              <option value="">— Select customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Number of totes *</label>
            <input
              type="number"
              min={1}
              max={totalTotes}
              className="input"
              placeholder="e.g. 5"
              value={form.toteCount}
              onChange={set('toteCount')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date *</label>
              <input type="date" className="input" value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label className="label">Return date *</label>
              <input type="date" className="input" min={form.startDate || today} value={form.returnDate} onChange={set('returnDate')} />
            </div>
          </div>

          {avail && form.toteCount && (
            <div className={`rounded-lg px-3 py-2.5 text-xs font-medium flex items-center gap-2 ${
              avail.requested > avail.available
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {avail.requested > avail.available ? (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Only {avail.available} totes available in this window
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {avail.available} totes available — looks good
                </>
              )}
            </div>
          )}

          {/* ── Drop-off ── */}
          <SectionHeader icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          } label="Drop-off" />

          <div>
            <label className="label">Drop-off address</label>
            <input
              className="input"
              placeholder="123 Main St, Suburb"
              value={form.dropoffAddress}
              onChange={set('dropoffAddress')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Drop-off date</label>
              <input type="date" className="input" value={form.dropoffDate} onChange={set('dropoffDate')} />
            </div>
            <div>
              <label className="label">Time window</label>
              <select className="input" value={form.dropoffWindow} onChange={set('dropoffWindow')}>
                <option value="">— Select window —</option>
                {TIME_WINDOWS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {/* ── Pick-up ── */}
          <SectionHeader icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          } label="Pick-up" />

          <div>
            <label className="label">Pick-up address</label>
            <input
              className="input"
              placeholder="123 Main St, Suburb"
              value={form.pickupAddress}
              onChange={set('pickupAddress')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Pick-up date</label>
              <input type="date" className="input" min={form.startDate || today} value={form.pickupDate} onChange={set('pickupDate')} />
            </div>
            <div>
              <label className="label">Time window</label>
              <select className="input" value={form.pickupWindow} onChange={set('pickupWindow')}>
                <option value="">— Select window —</option>
                {TIME_WINDOWS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pb-2 pt-1">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Create Rental'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Address + window pill ─────────────────────────────────────
function LogisticsBadge({ icon, label, address, date, window: timeWindow }) {
  if (!address && !timeWindow) return null
  return (
    <div className="flex items-start gap-1.5 text-xs text-gray-500">
      <span className="mt-0.5 text-gray-400 shrink-0">{icon}</span>
      <span className="font-medium text-gray-600 shrink-0">{label}:</span>
      <span className="truncate">
        {address || '—'}
        {(date || timeWindow) && (
          <span className="text-gray-400 ml-1">
            {date ? formatDate(date) : ''}
            {date && timeWindow ? ', ' : ''}
            {timeWindow}
          </span>
        )}
      </span>
    </div>
  )
}

// ── Rental row ────────────────────────────────────────────────
function RentalRow({ rental, onMarkReturned, marking }) {
  const today = toDateStr(new Date())
  const isOverdue = rental.status === 'active' && rental.returnDate < today
  const days = daysUntil(rental.returnDate)

  let dueBadge
  if (rental.status === 'returned') {
    dueBadge = <span className="text-xs font-medium text-gray-400">Returned</span>
  } else if (isOverdue) {
    dueBadge = (
      <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">
        {Math.abs(days)}d overdue
      </span>
    )
  } else if (days === 0) {
    dueBadge = <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">Due today</span>
  } else {
    dueBadge = <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{days}d left</span>
  }

  const hasLogistics = rental.dropoff?.address || rental.dropoff?.window ||
                       rental.pickup?.address  || rental.pickup?.window

  const dropoffIcon = (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )

  const pickupIcon = (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  )

  return (
    <div className={`px-5 py-4 ${isOverdue ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/customers/${rental.customerId}`} className="text-sm font-medium text-gray-900 hover:underline">
              {rental.customerName || 'Unknown'}
            </Link>
            {isOverdue && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {rental.toteCount} tote{rental.toteCount !== 1 ? 's' : ''} · {formatDate(rental.startDate)} → {formatDate(rental.returnDate)}
          </p>

          {/* Logistics */}
          {hasLogistics && (
            <div className="mt-2 flex flex-col gap-1">
              <LogisticsBadge
                icon={dropoffIcon}
                label="Drop-off"
                address={rental.dropoff?.address}
                date={rental.dropoff?.date}
                window={rental.dropoff?.window}
              />
              <LogisticsBadge
                icon={pickupIcon}
                label="Pick-up"
                address={rental.pickup?.address}
                date={rental.pickup?.date}
                window={rental.pickup?.window}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0 mt-0.5">
          {dueBadge}
          {rental.status === 'active' && (
            <button
              className="btn-secondary text-xs py-1.5 px-3"
              onClick={() => onMarkReturned(rental.id)}
              disabled={marking === rental.id}
            >
              {marking === rental.id ? '…' : 'Mark returned'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function Rentals() {
  const [customers, setCustomers]   = useState([])
  const [activeRentals, setActive]  = useState([])
  const [allRentals, setAll]        = useState([])
  const [totalTotes, setTotalTotes] = useState(20)
  const [showModal, setShowModal]   = useState(false)
  const [marking, setMarking]       = useState(null)
  const [tab, setTab]               = useState('active')

  useEffect(() => {
    const unsub = onSnapshot(settingsDoc, snap => {
      if (snap.exists()) setTotalTotes(snap.data().totalTotes ?? 20)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(customersCol, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      setCustomers(docs)
    })
    return unsub
  }, [])

  useEffect(() => {
    const q = query(rentalsCol, where('status', '==', 'active'))
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.returnDate ?? '').localeCompare(b.returnDate ?? ''))
      setActive(docs)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(rentalsCol, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
      setAll(docs)
    })
    return unsub
  }, [])

  async function handleMarkReturned(id) {
    setMarking(id)
    await markReturned(id)
    setMarking(null)
  }

  const today = toDateStr(new Date())
  const overdueCount = activeRentals.filter(r => r.returnDate < today).length
  const display = tab === 'active' ? activeRentals : allRentals

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rentals</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeRentals.length} active
            {overdueCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">{overdueCount} overdue</span>
            )}
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Rental
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        {[
          { key: 'active', label: 'Active' },
          { key: 'all',    label: 'All rentals' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {display.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">
            {tab === 'active' ? 'No active rentals' : 'No rentals yet'}
          </p>
          {tab === 'active' && (
            <button className="btn-primary mt-1" onClick={() => setShowModal(true)}>
              Create first rental
            </button>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {display.map(rental => (
            <RentalRow
              key={rental.id}
              rental={rental}
              onMarkReturned={handleMarkReturned}
              marking={marking}
            />
          ))}
        </div>
      )}

      {showModal && (
        <AddRentalModal
          onClose={() => setShowModal(false)}
          customers={customers}
          activeRentals={activeRentals}
          totalTotes={totalTotes}
        />
      )}
    </div>
  )
}
