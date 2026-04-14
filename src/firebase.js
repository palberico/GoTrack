import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// ── Collection references ──────────────────────────────────────
export const customersCol = collection(db, 'customers')
export const rentalsCol   = collection(db, 'rentals')
export const settingsDoc  = doc(db, 'settings', 'fleet')

// ── Settings helpers ──────────────────────────────────────────
export async function getFleetSize() {
  const snap = await getDoc(settingsDoc)
  if (snap.exists()) return snap.data().totalTotes ?? 20
  await setDoc(settingsDoc, { totalTotes: 20 })
  return 20
}

export async function updateFleetSize(n) {
  await setDoc(settingsDoc, { totalTotes: n }, { merge: true })
}

// ── Customer helpers ──────────────────────────────────────────
export async function addCustomer(data) {
  return addDoc(customersCol, { ...data, createdAt: serverTimestamp() })
}

export async function updateCustomer(id, data) {
  return updateDoc(doc(db, 'customers', id), data)
}

// ── Rental helpers ────────────────────────────────────────────
export async function addRental(data) {
  return addDoc(rentalsCol, {
    ...data,
    status: 'active',
    createdAt: serverTimestamp(),
  })
}

export async function markReturned(rentalId) {
  return updateDoc(doc(db, 'rentals', rentalId), {
    status: 'returned',
    returnedAt: serverTimestamp(),
  })
}

// ── Auth ──────────────────────────────────────────────────────
export const auth = getAuth(app)

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function logout() {
  return signOut(auth)
}

export function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, email)
}

export { onAuthStateChanged }

// ── Re-export Firestore helpers used in components ────────────
export {
  onSnapshot,
  query,
  where,
  collection,
  doc,
  getDoc,
}
