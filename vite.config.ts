import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["tictactoe.nik-server.in"],  // ✅ allow your domain
    proxy: {
      "/live": {
        target: "http://192.168.1.101:5000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/live/, ""),
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
