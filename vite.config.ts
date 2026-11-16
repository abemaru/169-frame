import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages のサブパスでも動くよう相対パスでビルドする
export default defineConfig({
  base: './',
  plugins: [react()],
})
