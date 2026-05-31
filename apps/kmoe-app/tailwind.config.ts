import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#151516',
        paper: '#f7f7f8',
        line: '#d7d8dc',
        pine: '#54645f',
        berry: '#9d3f53',
        amber: '#75613f'
      },
      boxShadow: {
        panel: '0 12px 30px rgb(23 32 38 / 0.10)'
      }
    }
  },
  plugins: []
} satisfies Config
