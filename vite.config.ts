import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Applied by `vite dev` and `vite preview`. Production hosts should also serve
// public/_headers (CSP + HSTS live there; dev needs a looser policy for HMR).
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: SECURITY_HEADERS,
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
})
