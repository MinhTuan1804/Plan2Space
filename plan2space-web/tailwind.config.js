/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#09090b',
          surface: '#121215',
          elevated: '#18181b',
          border: '#27272a',
          hover: '#2a2a30',
          accent: '#2563eb',
          accentHover: '#1d4ed8',
          text: '#f4f4f5',
          muted: '#a1a1aa',
          dim: '#71717a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
