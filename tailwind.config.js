/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        display: ['Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a5ff',
          500: '#3381fb',
          600: '#1d61f0',
          700: '#184ddc',
          800: '#1a40b2',
          900: '#1b3a8c',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c8',
          400: '#8591a8',
          500: '#66738d',
          600: '#515c74',
          700: '#424b5e',
          800: '#3a4150',
          900: '#0f1420',
          950: '#080b12',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,20,32,.04), 0 8px 24px -12px rgba(15,20,32,.18)',
        pop: '0 12px 40px -12px rgba(15,20,32,.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .25s ease-out both',
        'pop-in': 'pop-in .18s ease-out both',
      },
    },
  },
  plugins: [],
}
