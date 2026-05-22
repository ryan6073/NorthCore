import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 📥 引入最新现代化 Tailwind 插件

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // ⚡ 注入 Tailwind 编译器
  ],
})