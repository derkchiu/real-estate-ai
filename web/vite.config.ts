import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const workspace = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    fs: {
      allow: [root, workspace],
    },
    proxy: {
      "/api": {
        target: "https://real-estate-ai-derkchiu.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
