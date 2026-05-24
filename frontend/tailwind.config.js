/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'lark-primary': '#3370ff',
        'lark-primary-hover': '#2b5ede',
        'lark-primary-light': '#deebff',
        'lark-sidebar-bg': '#f5f6f7',
        'lark-bg-hover': '#eff0f1',
        'lark-text-primary': '#1f2329',
        'lark-text-secondary': '#646a73',
        'lark-text-tertiary': '#8f959e',
        'lark-border': '#dee0e3',
        'lark-message-user': '#deebff',
        'lark-message-agent': '#ffffff'
      }
    }
  },
  plugins: [],
}
