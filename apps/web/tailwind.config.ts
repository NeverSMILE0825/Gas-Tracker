/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#e7edf8',
        muted: '#93a0bd',
        line: 'rgba(148,163,196,0.16)',
        violet: '#8b5cf6',
        cyan: '#22d3ee',
        sky: '#60a5fa',
      },
      fontFamily: {
        sans: ['Outfit', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(139, 92, 246, 0.18)',
      },
    },
  },
  plugins: [],
}
