import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db, rentalsCol, onSnapshot, query, where, doc, getDoc } from '../firebase'

function statusBadge(status, returnDate) {
  if (status === 'returned') return { label: 'Returned', cls: 'bg-gray-100 text-gray-500' }
  const today = new Date().toISOString().slice(0, 10)
  if (returnDate < today) return { label: 'Overdue', cls: 'bg-red-100 text-red-600' }
  return { label: 'Active', cls: 'bg-green-100 text-green-700' }
}

function formatDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

export default function CustomerDetail() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCustomer() {
      const snap = await getDoc(doc(db, 'customers', id))
      if (snap.exists()) setCustomer({ id: snap.id, ...snap.data() })
      setLoading(false)
    }
    fetchCustomer()
  }, [id])

  useEffect(() => {
    const q = query(rentalsCol, where('customerId', '==', id))
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
      setRentals(docs)
    })
    return unsub
  }, [id])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-sm text-gray-400">Loading…</div>
    )
  }

  if (!customer) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Customer not found.</p>
        <Link to="/customers" className="text-sm text-gray-900 underline mt-2 inline-block">Back to Customers</Link>
      </div>
    )
  }

  const totalRentals   = rentals.length
  const activeRentals  = rentals.filter(r => r.status === 'active').length
  const totalTotes     = rentals.reduce((s, r) => s + (r.toteCount || 0), 0)

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      {/* Back */}
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Customers
      </Link>

      {/* Profile card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-white">
              {customer.name?.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')}
            </span>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1">
              {customer.email && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {customer.email}
                </span>
              )}
              {customer.phone && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {customer.phone}
                </span>
              )}
            </div>
            {(customer.address?.street || customer.address?.city) && (
              <span className="text-sm text-gray-500 flex items-start gap-1 mt-1">
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>
                  {[
                    customer.address.street,
                    customer.address.city,
                    customer.address.state,
                    customer.address.zip,
                  ].filter(Boolean).join(', ')}
                </span>
              </span>
            )}
            {customer.notes && (
              <p className="text-sm text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                {customer.notes}
              </p>
            )}
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalRentals}</p>
            <p className="text-xs text-gray-400">Total rentals</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{activeRentals}</p>
            <p className="text-xs text-gray-400">Active now</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalTotes}</p>
            <p className="text-xs text-gray-400">Totes rented</p>
          </div>
        </div>
      </div>

      {/* Rental history */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">Rental History</h2>

      {rentals.length === 0 ? (
        <div className="card p-10 text-center text-sm text-gray-400">No rentals yet for this customer.</div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {rentals.map(r => {
            const badge = statusBadge(r.status, r.returnDate)
            return (
              <div key={r.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {r.toteCount} tote{r.toteCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(r.startDate)} → {formatDate(r.returnDate)}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
