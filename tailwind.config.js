/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
