/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── SAP Fiori Horizon – light tokens ─────────────────────────────
        primary:    { DEFAULT: '#0070F2', hover: '#0064D9' },
        shell:      '#0A1F44',
        background: '#F5F6F7',
        surface:    '#FFFFFF',
        text:       { DEFAULT: '#1D2D3E', secondary: '#556B82' },
        border:     '#D9D9D9',
        success:    '#188918',
        warning:    '#E9730C',
        error:      '#D20A0A',
        info:       '#0070F2',

        // ── SAP Fiori Horizon – dark tokens ──────────────────────────────
        dark: {
          bg:         '#0D1B2A',
          surface:    '#1A2D42',
          surface2:   '#162030',
          nav:        '#0F1E30',
          text:       '#E2EAF4',
          textSec:    '#64788C',
          border:     '#243650',
          border2:    '#182840',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        control: '8px',
        card:    '12px',
      },
      boxShadow: {
        fiori:      '0 1px 4px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.07)',
        'fiori-md': '0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
        'fiori-lg': '0 8px 24px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
