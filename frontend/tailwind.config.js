
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          600: '#3457D5',
          700: '#2b49b3'
        }
      }
    }
  },
  darkMode: 'class',
  plugins: []
}
