import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const backendUrl = process.env.VITE_BACKEND_URL || "http://model-connectors-service:8000";
const devBackendUrl = process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

// Organized Vite configuration located in config/vite/
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: devBackendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: devBackendUrl,
        changeOrigin: true,
      },
      "/ws": {
        target: devBackendUrl,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: backendUrl,
        changeOrigin: true,
      },
      "/ws": {
        target: backendUrl,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist"),
    emptyOutDir: true,
  },
});
