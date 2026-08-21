/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:  { DEFAULT: '#F8F3E8', 2: '#F1EADB', 3: '#E9DFCA' },
        ink:    { DEFAULT: '#0E1E33', 2: '#39485F', 3: '#67758A' },
        line:   { DEFAULT: '#E1D7C5', 2: '#CCBEA6' },
        navy:   { DEFAULT: '#123E7C', 2: '#1B5FBF', ink: '#EFF4FA' },
        brass:  '#8A6209',
        gold:   { DEFAULT: '#E8A81C', dk: '#C68C0B' },
        moss:   '#3F6B4A',
        rust:   '#9C3B27',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        body: ['Inter Tight', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '2px', lg: '3px' },
      boxShadow: {
        card: '0 1px 0 rgba(14,30,51,.04), 0 1px 2px rgba(14,30,51,.06)',
        lift: '0 6px 22px -10px rgba(14,30,51,.30)',
      },
    },
  },
  plugins: [],
}
