/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Shared corner scale: small controls, buttons/chips, cards/dialogs.
      borderRadius: { sm: '6px', DEFAULT: '6px', md: '10px', lg: '10px', xl: '14px', '2xl': '14px' }
    },
  },
  plugins: [],
}