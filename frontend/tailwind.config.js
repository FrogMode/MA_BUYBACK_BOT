/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        movement: {
          primary: '#FF5722',
          secondary: '#1E1E1E',
          accent: '#FFC107',
        },
      },
    },
  },
  plugins: [],
};
