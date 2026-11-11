/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Shared corner scale: small controls, buttons/chips, cards/dialogs.
      borderRadius: { sm: '6px', DEFAULT: '6px', md: '10px', lg: '10px', xl: '14px', '2xl': '14px' },
      // Older dialogs were written with "emerald" classes; they now resolve to the app's blue and ink.
      colors: {
        emerald: { 50: '#eef1ff', 100: '#e0e6ff', 200: '#d6ddfb', 300: '#b9c4f7', 400: '#8295ed', 500: '#8295ed', 600: '#4c65eb', 700: '#3a52d0', 800: '#33437a', 900: '#1f2b45', 950: '#17213a' }
      }
    },
  },
  plugins: [],
}