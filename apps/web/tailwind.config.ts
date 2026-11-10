import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0A1633', 900: '#0F2150', 800: '#16306B', 700: '#1D3F87', 600: '#2A4FA0' },
        brand: { 50: '#EEF3FF', 100: '#DCE7FF', 200: '#BCD0FF', 500: '#2F62E8', 600: '#2150D4', 700: '#1A40AB' },
        canvas: '#F5F7FB',
        line: '#E2E8F3',
        ink: '#0E1A33',
        muted: '#5B6781',
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
      },
      borderRadius: { card: '14px', control: '10px' },
      boxShadow: {
        card: '0 1px 2px rgba(15, 33, 80, 0.06), 0 0 0 1px rgba(15, 33, 80, 0.04)',
        pop: '0 12px 32px rgba(10, 22, 51, 0.16), 0 0 0 1px rgba(15, 33, 80, 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 160ms ease-out',
        'toast-in': 'toast-in 180ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
