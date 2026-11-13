import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, /api/* is proxied to the FastAPI backend so no CORS setup is needed.
// In production set VITE_API_BASE_URL (see .env.example).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
