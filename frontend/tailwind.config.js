/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Figtree"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'xs':  ['0.875rem',  { lineHeight: '1.25rem' }],
        'sm':  ['1rem',      { lineHeight: '1.5rem'  }],
        'base':['1.125rem',  { lineHeight: '1.75rem' }],
        'lg':  ['1.5rem',    { lineHeight: '1.875rem'}],
        'xl':  ['2rem',      { lineHeight: '2.25rem' }],
        '2xl': ['2.75rem',   { lineHeight: '3rem'    }],
        '3xl': ['3.75rem',   { lineHeight: '4rem'    }],
      },
      colors: {
        // Brand palette
        primary: {
          DEFAULT: '#2E2A6B',
          50:  '#EEEDF8',
          100: '#D5D3EE',
          200: '#ABA8DC',
          300: '#817DCB',
          400: '#5752B9',
          500: '#2E2A6B',
          600: '#252157',
          700: '#1C1942',
          800: '#13102E',
          900: '#0A0819',
          950: '#050410',
        },
        secondary: {
          DEFAULT: '#8F8CD6',
          50:  '#F4F3FB',
          100: '#E6E5F5',
          200: '#CECCEA',
          300: '#B5B3E0',
          400: '#9D9BD8',
          500: '#8F8CD6',
          600: '#6B68C8',
          700: '#4946B4',
          800: '#38369A',
          900: '#272580',
        },
        accent: {
          DEFAULT: '#FFB020',
          50:  '#FFF8E7',
          100: '#FEEFC5',
          200: '#FDDF8B',
          300: '#FCCF51',
          400: '#FBBF17',
          500: '#FFB020',
          600: '#D4901A',
          700: '#A97014',
          800: '#7E500E',
          900: '#533008',
        },
        // Neutrals
        ground: '#F4F3FB',
        surface: '#FFFFFF',
        body: '#1F1B4D',
        muted: '#5F5A89',   // 4.6:1 on white
        // Named neutrals for dark mode
        ink: {
          50:  '#F4F3FB',
          100: '#E5E4F4',
          200: '#CCCAE8',
          300: '#B3B0DC',
          400: '#9A96D0',
          500: '#817DC4',
          600: '#5F5A89',
          700: '#3E3B5E',
          800: '#2A2748',
          900: '#1F1B4D',
          950: '#140F38',
        },
        // Dark-mode surfaces
        dark: {
          bg:       '#151230',
          surface:  '#1E1A44',
          elevated: '#252152',
          border:   '#2E2A6B',
          text:     '#DDD9FF',
          muted:    '#8F8CD6',
        },
      },
      borderRadius: {
        'container': '24px',
        'card':      '16px',
        'btn':       '12px',
        'input':     '12px',
        'chip':      '9999px',
      },
      boxShadow: {
        'card':   '0 1px 3px rgba(46,42,107,0.06), 0 4px 12px rgba(46,42,107,0.08)',
        'card-md':'0 2px 8px rgba(46,42,107,0.08), 0 8px 24px rgba(46,42,107,0.10)',
        'modal':  '0 8px 32px rgba(46,42,107,0.16), 0 2px 8px rgba(46,42,107,0.08)',
        'btn':    '0 1px 3px rgba(46,42,107,0.10)',
        'focus':  '0 0 0 3px rgba(143,140,214,0.35)',
      },
      spacing: {
        '4.5': '1.125rem',
        '18':  '4.5rem',
      },
      animation: {
        'fade-in':   'fadeIn 0.25s ease-out',
        'slide-in':  'slideIn 0.22s ease-out',
        'page-in':   'pageIn 0.3s cubic-bezier(0.22,1,0.36,1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-6px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        pageIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
