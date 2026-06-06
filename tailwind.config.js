/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#07070e',
        surface: { DEFAULT: '#0d0d16', hover: '#12121e' },
        line: { DEFAULT: '#1a1a2a', hover: '#2a2a3a' },
        primary: { DEFAULT: '#4a9eff', muted: '#1a3a5c' },
        ink: { DEFAULT: '#e8e8ed', secondary: '#6b6b7b', muted: '#3a3a4a' },
        up: '#34d399',
        down: '#f87171',
        warn: '#fbbf24',
        info: '#60a5fa',
        racer: { you: '#4a9eff', whale: '#fbbf24' },
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
    },
  },
  plugins: [],
}
