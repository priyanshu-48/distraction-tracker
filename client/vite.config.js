import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production pages only: the dev server needs inline scripts and eval for hot reload. A page script can then load code
// only from this site and talk only to the API, which limits what an injected script could do (and where it could send data).
function cspPlugin(apiUrl = 'http://localhost:3000/api') {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // components set a few inline styles (bar widths and so on)
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${new URL(apiUrl).origin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'dt-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(),react(),cspPlugin(loadEnv(mode, process.cwd(), '').VITE_API_URL || process.env.VITE_API_URL)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    // Pure logic runs in node; component tests opt in with `// @vitest-environment jsdom` at the top.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
}))
