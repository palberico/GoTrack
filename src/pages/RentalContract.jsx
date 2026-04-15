import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import emailjs from '@emailjs/browser'
import { db, rentalsCol, confirmRental, doc, getDoc, query, where, onSnapshot } from '../firebase'

// ── helpers ───────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

const TERMS = [
  {
    title: 'Tote Condition',
    body: 'All totes must be returned in the same clean, usable condition as received. Totes must be free from stains, tears, broken handles, or structural damage of any kind.',
  },
  {
    title: 'Child Safety',
    body: 'Totes are not toys. The customer agrees not to allow children to use totes as play equipment or for any purpose other than their intended use.',
  },
  {
    title: 'Lost or Damaged Totes',
    body: 'The customer agrees to pay for and replace any lost, stolen, or damaged totes at the current replacement cost. Go Track will invoice the customer for any unreturned or damaged items.',
  },
  {
    title: 'Return Deadline',
    body: 'All totes must be returned by the agreed return date shown in this agreement. Late returns may incur a daily late fee at the discretion of Go Track.',
  },
  {
    title: 'Permitted Use',
    body: 'Totes must not be used to store or transport hazardous, illegal, or strongly perishable materials. Totes are intended for general goods transport and storage only.',
  },
  {
    title: 'Safekeeping',
    body: 'The customer is solely responsible for the safekeeping of all totes during the rental period. Go Track is not liable for loss or theft while in the customer\'s possession.',
  },
  {
    title: 'Inspection & Charges',
    body: 'Go Track reserves the right to inspect returned totes and assess damage or cleaning charges where applicable. The customer will be notified of any charges within 48 hours of return.',
  },
  {
    title: 'Agreement',
    body: 'By signing below, the customer acknowledges they have read, understood, and agree to all terms and conditions set out in this rental agreement.',
  },
]

// ── Signature canvas ──────────────────────────────────────────
function SignatureCanvas({ onChange }) {
  const canvasRef   = useRef(null)
  const drawing     = useRef(false)
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

// ── PDF generation ────────────────────────────────────────────
function buildPDF(rental, customer, signatureDataUrl, signerName, signedDate) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
  const W    = 210
  const L    = 20   // left margin
  const R    = W - 20 // right edge
  let   y    = 20

  function heading(text, size = 11) {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(text, L, y)
    y += size * 0.5
  }

  function body(text, size = 9) {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    const lines = doc.splitTextToSize(text, R - L)
    doc.text(lines, L, y)
    y += lines.length * (size * 0.45) + 2
  }

  function rule(color = [220, 220, 220]) {
    doc.setDrawColor(...color)
    doc.line(L, y, R, y)
    y += 5
  }

  function gap(n = 4) { y += n }

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(34, 197, 94)
  doc.roundedRect(L, y, 12, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('GT', L + 3.5, y + 7.5)

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Go Green Totes', L + 15, y + 8)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Rental Agreement', R, y + 8, { align: 'right' })

  y += 18
  rule([34, 197, 94])

  // ── Rental summary ────────────────────────────────────────
  heading('Rental Details')
  gap(3)
  body(`Rental ID: #${rental.id.slice(-6).toUpperCase()}`)
  body(`Agreement Date: ${signedDate}`)
  body(`Delivered Date: ${signedDate}`)
  gap(3)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)

  // Two-column layout
  const col2 = L + 90
  const rowH = 7

  function labelVal(label, val, x, yy) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 120)
    doc.setFontSize(7.5)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(9)
    doc.text(String(val || '—'), x, yy + 4)
  }

  labelVal('Customer', customer?.name ?? '—',           L,    y)
  labelVal('Email',    customer?.email ?? '—',          col2, y)
  y += rowH + 2

  labelVal('Totes',       String(rental.toteCount),           L,    y)
  labelVal('Rental From', formatDate(rental.startDate),       col2, y)
  y += rowH + 2

  labelVal('Return Date', formatDate(rental.returnDate),      L,    y)
  y += rowH + 2

  if (rental.dropoff?.address) {
    labelVal('Drop-off Address', rental.dropoff.address, L, y)
    y += rowH + 2
  }

  if (rental.pickup?.address) {
    labelVal('Pick-up Address', rental.pickup.address, L, y)
    y += rowH + 2
  }

  gap(4)
  rule()

  // ── Terms ─────────────────────────────────────────────────
  heading('Terms & Conditions')
  gap(4)

  TERMS.forEach((t, i) => {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`${i + 1}. ${t.title}`, L, y)
    y += 4.5
    body(t.body)
    gap(1)
  })

  gap(3)
  rule()

  // ── Signature block ────────────────────────────────────────
  if (y > 210) { doc.addPage(); y = 20 }

  heading('Customer Acknowledgment')
  gap(3)
  body(`I, ${signerName}, confirm that I have read and agree to all terms and conditions of this rental agreement.`)
  gap(4)

  if (signatureDataUrl) {
    doc.addImage(signatureDataUrl, 'PNG', L, y, 80, 22)
    y += 26
  }

  doc.setDrawColor(180, 180, 180)
  doc.line(L, y, L + 80, y)
  y += 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Customer Signature', L, y)

  doc.line(L + 90, y - 4, L + 140, y - 4)
  doc.text(`Date: ${signedDate}`, L + 90, y)

  return doc
}

// ── Main page ─────────────────────────────────────────────────
export default function RentalContract() {
  const { id }    = useParams()
  const navigate  = useNavigate()

  const [rental,     setRental]     = useState(null)
  const [customer,   setCustomer]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [agreed,     setAgreed]     = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signature,  setSignature]  = useState(null)
  const [signedDate, setSignedDate] = useState(new Date().toLocaleDateString('en-US'))
  const [submitting, setSubmitting] = useState(false)
  const [sent,       setSent]       = useState(false)
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

  async function handleConfirm() {
    if (!agreed)     { setError('Please check the acknowledgment box.'); return }
    if (!signature)  { setError('Please sign the agreement.'); return }
    if (!signerName.trim()) { setError('Please enter the signer\'s name.'); return }

    setError('')
    setSubmitting(true)

    try {
      // 1 — Generate PDF
      const pdfDoc  = buildPDF(rental, customer, signature, signerName, signedDate)
      const pdfB64  = pdfDoc.output('datauristring') // data URI
      const pdfBlob = pdfDoc.output('blob')

      // 2 — Download PDF to device (always works as a backup)
      const dlUrl  = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      anchor.href     = dlUrl
      anchor.download = `GoTrack-Contract-${rental.id.slice(-6).toUpperCase()}.pdf`
      anchor.click()
      URL.revokeObjectURL(dlUrl)

      // 3 — Send email via EmailJS (best-effort)
      const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
      const publicKey  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

      if (serviceId && templateId && publicKey &&
          !serviceId.startsWith('your_')) {
        try {
          await emailjs.send(serviceId, templateId, {
            to_name:     customer?.name   ?? 'Customer',
            to_email:    customer?.email  ?? '',
            rental_id:   rental.id.slice(-6).toUpperCase(),
            tote_count:  String(rental.toteCount),
            start_date:  formatDate(rental.startDate),
            return_date: formatDate(rental.returnDate),
            signed_date: signedDate,
          }, publicKey)
        } catch (emailErr) {
          console.warn('Email send failed:', emailErr)
          // Don't block confirmation if email fails
        }
      }

      // 4 — Confirm rental in Firestore
      await confirmRental(id, {
        signatureDataUrl: signature,
        signerName:       signerName.trim(),
        signedDate,
      })

      setSent(true)
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────────
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

  // ── Already confirmed ────────────────────────────────────────
  if (sent || rental.status === 'delivered') {
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
              {sent ? 'Contract confirmed!' : 'Already confirmed'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {sent
                ? `PDF downloaded to your device${customer?.email ? ` and a confirmation email was sent to ${customer.email}` : ''}.`
                : `This rental was confirmed on ${rental.signedDate ?? '—'}.`}
            </p>
          </div>
          <button className="btn-primary mt-2" onClick={() => navigate('/rentals')}>
            Back to Rentals
          </button>
        </div>
      </div>
    )
  }

  // ── Contract form ────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Back */}
      <Link to="/rentals" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Rentals
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rental Agreement</h1>
      <p className="text-sm text-gray-400 mb-6">
        Review the terms below, sign, and confirm to activate this rental.
      </p>

      {/* Rental summary */}
      <div className="card p-5 mb-6 bg-gray-50 border-gray-200">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Rental Summary</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            ['Customer',    customer?.name ?? '—'],
            ['Email',       customer?.email ?? '—'],
            ['Totes',       `${rental.toteCount} tote${rental.toteCount !== 1 ? 's' : ''}`],
            ['Start date',  formatDate(rental.startDate)],
            ['Return date', formatDate(rental.returnDate)],
            rental.dropoff?.address && ['Drop-off', rental.dropoff.address],
            rental.dropoff?.window  && ['Drop-off window', rental.dropoff.window],
            rental.pickup?.address  && ['Pick-up', rental.pickup.address],
            rental.pickup?.window   && ['Pick-up window', rental.pickup.window],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-800 truncate">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Terms & Conditions */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Terms &amp; Conditions</h2>
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {TERMS.map((t, i) => (
            <div key={i}>
              <p className="text-xs font-semibold text-gray-700">{i + 1}. {t.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Acknowledgment + Signature */}
      <div className="card p-5 mb-6 flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-gray-900">Customer Acknowledgment</h2>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 rounded accent-gray-900 shrink-0"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
          />
          <span className="text-sm text-gray-600 leading-relaxed">
            I have read and agree to all terms and conditions of this rental agreement, and I accept responsibility for the totes for the duration of the rental period.
          </span>
        </label>

        {/* Signer name */}
        <div>
          <label className="label">Full name (print)</label>
          <input
            className="input"
            placeholder="Jane Smith"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
          />
        </div>

        {/* Signature */}
        <div>
          <label className="label">Signature</label>
          <SignatureCanvas onChange={setSignature} />
        </div>

        {/* Date */}
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
        onClick={handleConfirm}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Confirming…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Confirm &amp; Send Contract
          </>
        )}
      </button>
      <p className="text-xs text-gray-400 text-center mt-3">
        A PDF will download to this device
        {customer?.email ? ` and a confirmation email will be sent to ${customer.email}` : ''}.
      </p>
    </div>
  )
}
