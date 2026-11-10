import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stylesPath = path.resolve(__dirname, "../../src/main/resources/assets/styles");
const tsPath = path.resolve(__dirname, "../../src/main/typescript");
const pkgNodeModules = path.resolve(__dirname, "../../node_modules");
const workspaceNodeModules = path.resolve(__dirname, "../../../../node_modules");

export default defineConfig({
  root: path.resolve(__dirname, "../../src/main/resources"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/styles\/(.*)/, replacement: `${stylesPath}/$1` },
      { find: /^@\/assets\/styles\/(.*)/, replacement: `${stylesPath}/$1` },
      { find: /^@\/(.*)/, replacement: `${tsPath}/$1` },
      { find: "@resources", replacement: path.resolve(__dirname, "../../src/main/resources") },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [stylesPath, pkgNodeModules, workspaceNodeModules],
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3005,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8095",
        changeOrigin: true,
      },
    },
  },
});
