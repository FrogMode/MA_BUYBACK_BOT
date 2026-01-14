/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#050508',
        foreground: '#ffffff',
        movement: {
          yellow: '#FFDA00',
          'yellow-light': '#FFF4B3',
          dark: '#050508',
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.08)',
          highlight: 'rgba(255, 255, 255, 0.12)',
        },
      },
      backdropBlur: {
        glass: '20px',
      },
    },
  },
  plugins: [],
};
