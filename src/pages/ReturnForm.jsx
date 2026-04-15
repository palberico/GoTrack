import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import emailjs from '@emailjs/browser'
import { db, processReturn, doc, getDoc } from '../firebase'

const CHARGE_PER_TOTE = 10

function formatDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

// ── Signature canvas ──────────────────────────────────────────
function SignatureCanvas({ onChange }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  function coords(e, canvas) {
    const rect  = canvas.getBoundingClientRect()
    const touch = e.touches?.[0] ?? e
    return {
      x: (touch.clientX - rect.left) * (canvas.width  / rect.width),
      y: (touch.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  function startDraw(e) {
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = coords(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.strokeStyle = '#111827'
    const { x, y } = coords(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSig(true)
    onChange(canvas.toDataURL('image/png'))
  }

  function endDraw() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={900}
        height={200}
        className="w-full h-28 border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-400">Sign above using your mouse or finger</p>
        {hasSig && (
          <button type="button" onClick={clear} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── PDF builder ───────────────────────────────────────────────
function buildReturnPDF(rental, customer, rec, signerName, signedDate) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W   = 210
  const L   = 20
  const R   = W - 20
  let   y   = 20

  function heading(text, size = 11) {
    pdf.setFontSize(size)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 30, 30)
    pdf.text(text, L, y)
    y += size * 0.5
  }

  function body(text, size = 9) {
    pdf.setFontSize(size)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(80, 80, 80)
    const lines = pdf.splitTextToSize(text, R - L)
    pdf.text(lines, L, y)
    y += lines.length * (size * 0.45) + 2
  }

  function rule(color = [220, 220, 220]) {
    pdf.setDrawColor(...color)
    pdf.line(L, y, R, y)
    y += 5
  }

  function gap(n = 4) { y += n }

  function labelVal(label, val, x, yy) {
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(120, 120, 120)
    pdf.setFontSize(7.5)
    pdf.text(label.toUpperCase(), x, yy)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(30, 30, 30)
    pdf.setFontSize(9)
    pdf.text(String(val || '—'), x, yy + 4)
  }

  // ── Header ────────────────────────────────────────────────
  pdf.setFillColor(34, 197, 94)
  pdf.roundedRect(L, y, 12, 12, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('GGT', L + 2.5, y + 7.5)

  pdf.setTextColor(30, 30, 30)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Go Green Totes', L + 15, y + 8)

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Return Receipt', R, y + 8, { align: 'right' })

  y += 18
  rule([34, 197, 94])

  // ── Return details ────────────────────────────────────────
  heading('Return Details')
  gap(3)
  body(`Rental ID: #${rental.id.slice(-6).toUpperCase()}`)
  body(`Return Date: ${signedDate}`)
  gap(3)

  const col2 = L + 90
  const rowH = 7

  labelVal('Customer',      customer?.name  ?? '—',                                 L,    y)
  labelVal('Email',         customer?.email ?? '—',                                 col2, y)
  y += rowH + 2

  labelVal('Totes Rented',   String(rental.toteCount),                              L,    y)
  labelVal('Rental Period',  `${formatDate(rental.startDate)} – ${formatDate(rental.returnDate)}`, col2, y)
  y += rowH + 2

  const nonReturned = rec.damaged + rec.lost + rec.purchased + rec.other
  labelVal('Totes Returned', String(rec.returnedCount),                             L,    y)
  if (nonReturned > 0) labelVal('Not Returned', String(nonReturned),               col2, y)
  y += rowH + 2

  gap(4)
  rule()

  // ── Breakdown (only when there are missing totes) ─────────
  if (rec.charges > 0) {
    heading('Breakdown of Non-Returned Totes')
    gap(4)

    const rows = [
      ['Damaged',   rec.damaged],
      ['Lost',      rec.lost],
      ['Purchased', rec.purchased],
      ['Other',     rec.other],
    ].filter(([, n]) => n > 0)

    rows.forEach(([label, count]) => {
      const charge = count * CHARGE_PER_TOTE
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(80, 80, 80)
      pdf.text(`${label}: ${count} tote${count !== 1 ? 's' : ''} × $${CHARGE_PER_TOTE.toFixed(2)}`, L, y)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(30, 30, 30)
      pdf.text(`$${charge.toFixed(2)}`, R, y, { align: 'right' })
      y += 6
    })

    if (rec.otherNotes) {
      gap(1)
      body(`Other notes: ${rec.otherNotes}`)
    }

    gap(3)

    // Amber charges box
    pdf.setFillColor(254, 243, 199)
    pdf.roundedRect(L, y, R - L, 14, 2, 2, 'F')
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(120, 53, 15)
    pdf.text('Total Additional Charges', L + 4, y + 9)
    pdf.text(`$${rec.charges.toFixed(2)}`, R - 4, y + 9, { align: 'right' })
    y += 20

  } else {
    // Green all-clear box
    pdf.setFillColor(220, 252, 231)
    pdf.roundedRect(L, y, R - L, 14, 2, 2, 'F')
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(20, 83, 45)
    pdf.text('All totes returned — No additional charges', L + 4, y + 9)
    pdf.text('$0.00', R - 4, y + 9, { align: 'right' })
    y += 20
  }

  rule()

  // ── Acknowledgment + Signature ────────────────────────────
  if (y > 210) { pdf.addPage(); y = 20 }

  heading('Customer Acknowledgment')
  gap(3)
  body(`I, ${signerName}, confirm that the tote return details above are accurate${rec.charges > 0 ? ` and I accept the additional charge of $${rec.charges.toFixed(2)}` : ''}.`)
  gap(4)

  if (rec.signatureDataUrl) {
    pdf.addImage(rec.signatureDataUrl, 'PNG', L, y, 80, 22)
    y += 26
  }

  pdf.setDrawColor(180, 180, 180)
  pdf.line(L, y, L + 80, y)
  y += 4
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Customer Signature', L, y)
  pdf.line(L + 90, y - 4, L + 140, y - 4)
  pdf.text(`Date: ${signedDate}`, L + 90, y)

  return pdf
}

// ── Count row inside breakdown card ──────────────────────────
function CountRow({ label, value, onChange, disabled, max }) {
  const charge = (value || 0) * CHARGE_PER_TOTE
  return (
    <div className={`flex items-center gap-3 transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-sm text-gray-700 w-28 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        disabled={disabled}
        className="input w-20 text-center"
        value={value || ''}
        placeholder="0"
        onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <span className="text-xs text-gray-400 flex-1">
        × ${CHARGE_PER_TOTE} = <span className="font-semibold text-gray-700">${charge.toFixed(2)}</span>
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function ReturnForm() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [rental,    setRental]    = useState(null)
  const [customer,  setCustomer]  = useState(null)
  const [loading,   setLoading]   = useState(true)

  const [returnedCount, setReturnedCount] = useState('')
  const [damaged,   setDamaged]   = useState(0)
  const [lost,      setLost]      = useState(0)
  const [purchased, setPurchased] = useState(0)
  const [other,     setOther]     = useState(0)
  const [otherNotes, setOtherNotes] = useState('')

  const [agreed,    setAgreed]    = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signature, setSignature] = useState(null)
  const [signedDate, setSignedDate] = useState(new Date().toLocaleDateString('en-US'))

  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'rentals', id))
      if (!snap.exists()) { setLoading(false); return }
      const r = { id: snap.id, ...snap.data() }
      setRental(r)
      const cSnap = await getDoc(doc(db, 'customers', r.customerId))
      if (cSnap.exists()) {
        const c = { id: cSnap.id, ...cSnap.data() }
        setCustomer(c)
        setSignerName(c.name ?? '')
      }
      setLoading(false)
    }
    load()
  }, [id])

  // ── derived ──────────────────────────────────────────────
  const totalRented  = rental?.toteCount ?? 0
  const returned     = parseInt(returnedCount, 10) || 0
  const unaccounted  = Math.max(0, totalRented - returned)
  const allMatch     = returnedCount !== '' && returned === totalRented
  const breakdownSum = damaged + lost + purchased + other
  const charges      = breakdownSum * CHARGE_PER_TOTE

  function resetBreakdown() {
    setDamaged(0); setLost(0); setPurchased(0); setOther(0); setOtherNotes('')
  }

  async function handleSubmit() {
    if (returnedCount === '')         { setError('Enter the number of totes returned.'); return }
    if (returned > totalRented)       { setError(`Cannot exceed ${totalRented} totes rented.`); return }
    if (returned < 0)                 { setError('Returned count cannot be negative.'); return }
    if (!allMatch && breakdownSum !== unaccounted) {
      setError(`Breakdown (${breakdownSum}) must equal the ${unaccounted} unaccounted tote${unaccounted !== 1 ? 's' : ''}.`)
      return
    }
    if (!agreed)                      { setError('Please check the acknowledgment box.'); return }
    if (!signature)                   { setError('Please sign the form.'); return }
    if (!signerName.trim())           { setError("Please enter the signer's name."); return }

    setError('')
    setSubmitting(true)

    try {
      const returnRecord = {
        returnedCount: returned,
        damaged, lost, purchased, other,
        otherNotes: otherNotes.trim(),
        charges,
        signerName: signerName.trim(),
        signedDate,
        signatureDataUrl: signature,
      }

      // 1 — Generate + download PDF
      const pdfDoc  = buildReturnPDF(rental, customer, returnRecord, signerName, signedDate)
      const pdfBlob = pdfDoc.output('blob')
      const dlUrl   = URL.createObjectURL(pdfBlob)
      const anchor  = document.createElement('a')
      anchor.href     = dlUrl
      anchor.download = `GoGreenTotes-Return-${rental.id.slice(-6).toUpperCase()}.pdf`
      anchor.click()
      URL.revokeObjectURL(dlUrl)

      // 2 — Email (best-effort)
      const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
      const publicKey  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      if (serviceId && !serviceId.startsWith('your_') && customer?.email) {
        try {
          await emailjs.send(serviceId, templateId, {
            to_name:    customer.name ?? 'Customer',
            to_email:   customer.email,
            rental_id:  rental.id.slice(-6).toUpperCase(),
            tote_count: String(totalRented),
            returned:   String(returned),
            charges:    `$${charges.toFixed(2)}`,
            signed_date: signedDate,
          }, publicKey)
        } catch (e) { console.warn('Return email failed:', e) }
      }

      // 3 — Firestore: mark returned + shrink fleet by permanently-lost totes
      await processReturn(id, returnRecord, breakdownSum)

      setDone(true)
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!rental) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Rental not found.</p>
        <Link to="/rentals" className="text-sm underline mt-2 inline-block">Back to Rentals</Link>
      </div>
    )
  }

  // ── already returned ─────────────────────────────────────
  if (done || rental.status === 'returned') {
    return (
      <div className="p-6 md:p-8 max-w-xl mx-auto">
        <div className="card p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {done ? 'Return processed!' : 'Already returned'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {done
                ? `PDF receipt downloaded${customer?.email ? ` and a copy was sent to ${customer.email}` : ''}.`
                : 'This rental has already been marked as returned.'}
            </p>
          </div>
          <button className="btn-primary mt-2" onClick={() => navigate('/rentals')}>
            Back to Rentals
          </button>
        </div>
      </div>
    )
  }

  // ── form ─────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Back */}
      <Link to="/rentals" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Rentals
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Return Verification</h1>
      <p className="text-sm text-gray-400 mb-6">
        Verify the tote return for{' '}
        <span className="font-medium text-gray-700">{customer?.name ?? 'Customer'}</span>
        {' '}· Rental #{rental.id.slice(-6).toUpperCase()}
      </p>

      {/* Rental summary */}
      <div className="card p-5 mb-4 bg-gray-50 border-gray-200">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Rental Summary</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            ['Customer',     customer?.name ?? '—'],
            ['Email',        customer?.email ?? '—'],
            ['Totes rented', `${rental.toteCount} tote${rental.toteCount !== 1 ? 's' : ''}`],
            ['Period',       `${formatDate(rental.startDate)} – ${formatDate(rental.returnDate)}`],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-800">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tote count */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Tote Count</h2>

        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Total totes rented</span>
          <span className="text-2xl font-bold text-gray-900">{totalRented}</span>
        </div>

        <div className="flex items-center justify-between py-3">
          <label className="text-sm font-medium text-gray-700">Total returned</label>
          <input
            type="number"
            min={0}
            max={totalRented}
            className="input w-28 text-center text-lg font-semibold"
            placeholder={`0 – ${totalRented}`}
            value={returnedCount}
            onChange={e => {
              setReturnedCount(e.target.value)
              resetBreakdown()
              setError('')
            }}
          />
        </div>

        {returnedCount !== '' && (
          <div className={`rounded-lg px-3 py-2.5 text-xs font-medium flex items-center gap-2 ${
            allMatch
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {allMatch ? (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                All {totalRented} totes accounted for — no additional charges
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {unaccounted} tote{unaccounted !== 1 ? 's' : ''} unaccounted — complete the breakdown below
              </>
            )}
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className={`card p-5 mb-4 transition-opacity ${allMatch ? 'opacity-50 pointer-events-none select-none' : ''}`}>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Unaccounted Breakdown</h2>
        <p className="text-xs text-gray-400 mb-4">
          {allMatch
            ? 'No breakdown needed — all totes returned'
            : `Explain what happened to the ${unaccounted} missing tote${unaccounted !== 1 ? 's' : ''}. Each incurs a $${CHARGE_PER_TOTE} charge.`}
        </p>

        <div className="flex flex-col gap-3 mb-4">
          <CountRow label="Damaged"   value={damaged}   onChange={setDamaged}   disabled={allMatch} max={unaccounted} />
          <CountRow label="Lost"      value={lost}      onChange={setLost}      disabled={allMatch} max={unaccounted} />
          <CountRow label="Purchased" value={purchased} onChange={setPurchased} disabled={allMatch} max={unaccounted} />
          <CountRow label="Other"     value={other}     onChange={setOther}     disabled={allMatch} max={unaccounted} />
        </div>

        {!allMatch && (
          <div className="mb-4">
            <label className="label">Notes (required if using Other)</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Describe any totes counted under Other…"
              value={otherNotes}
              onChange={e => setOtherNotes(e.target.value)}
            />
          </div>
        )}

        {!allMatch && returnedCount !== '' && (
          <div className={`rounded-lg px-3 py-2.5 text-xs font-medium flex items-center gap-2 ${
            breakdownSum === unaccounted
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {breakdownSum === unaccounted ? (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Breakdown accounts for all {unaccounted} missing tote{unaccounted !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {unaccounted - breakdownSum > 0
                  ? `${unaccounted - breakdownSum} more tote${unaccounted - breakdownSum !== 1 ? 's' : ''} still need to be accounted for`
                  : `${breakdownSum - unaccounted} over — reduce your breakdown by ${breakdownSum - unaccounted}`}
              </>
            )}
          </div>
        )}
      </div>

      {/* Charges summary */}
      <div className={`card p-5 mb-4 ${charges > 0 ? 'bg-amber-50/40 border-amber-200' : 'bg-green-50/40 border-green-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Additional Charges</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {charges > 0
                ? `${breakdownSum} tote${breakdownSum !== 1 ? 's' : ''} × $${CHARGE_PER_TOTE} per tote`
                : 'All totes returned — no charges'}
            </p>
          </div>
          <span className={`text-3xl font-bold ${charges > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            ${charges.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Acknowledgment + Signature */}
      <div className="card p-5 mb-6 flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-gray-900">Customer Acknowledgment</h2>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 rounded accent-gray-900 shrink-0"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
          />
          <span className="text-sm text-gray-600 leading-relaxed">
            I confirm the return details above are accurate
            {charges > 0
              ? ` and I agree to the additional charge of $${charges.toFixed(2)}`
              : ' and that all totes have been returned in good condition'}.
          </span>
        </label>

        <div>
          <label className="label">Full name (print)</label>
          <input
            className="input"
            placeholder="Jane Smith"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Signature</label>
          <SignatureCanvas onChange={setSignature} />
        </div>

        <div>
          <label className="label">Date</label>
          <input
            className="input w-48"
            value={signedDate}
            onChange={e => setSignedDate(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <button
        className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Process Return &amp; Download Receipt
          </>
        )}
      </button>
      <p className="text-xs text-gray-400 text-center mt-3">
        A PDF receipt will download to this device
        {customer?.email ? ` and a copy will be sent to ${customer.email}` : ''}.
      </p>
    </div>
  )
}
