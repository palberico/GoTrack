import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { customersCol, addCustomer, onSnapshot } from '../firebase'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

function AddCustomerModal({ onClose }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    street: '', city: '', state: '', zip: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await addCustomer({
        name:   form.name.trim(),
        phone:  form.phone.trim(),
        email:  form.email.trim(),
        address: {
          street: form.street.trim(),
          city:   form.city.trim(),
          state:  form.state.trim(),
          zip:    form.zip.trim(),
        },
        notes:  form.notes.trim(),
      })
      onClose()
    } catch (err) {
      setError('Failed to save. Check your Firebase config.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">New Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" placeholder="Jane Smith" value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" placeholder="(555) 000-0000" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="jane@example.com" value={form.email} onChange={set('email')} />
          </div>

          {/* Address */}
          <div className="flex items-center gap-2 pt-1">
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <div>
            <label className="label">Street</label>
            <input className="input" placeholder="123 Main St" value={form.street} onChange={set('street')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">City</label>
              <input className="input" placeholder="Springfield" value={form.city} onChange={set('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" placeholder="IL" value={form.state} onChange={set('state')} />
            </div>
          </div>
          <div>
            <label className="label">ZIP code</label>
            <input className="input" placeholder="62701" value={form.zip} onChange={set('zip')} />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={3} placeholder="Any notes…" value={form.notes} onChange={set('notes')} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pb-2 pt-1">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Add Customer'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(customersCol, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      setCustomers(docs)
    })
    return unsub
  }, [])

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{customers.length} total</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          className="input pl-9"
          placeholder="Search by name, email or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Customer list */}
      {filtered.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">
            {search ? 'No customers match your search' : 'No customers yet'}
          </p>
          {!search && (
            <button className="btn-primary mt-1" onClick={() => setShowModal(true)}>
              Add first customer
            </button>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {filtered.map(c => (
            <Link
              key={c.id}
              to={`/customers/${c.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-white">{initials(c.name)}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[c.email, c.phone].filter(Boolean).join(' · ')}
                </p>
              </div>

              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {showModal && <AddCustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
