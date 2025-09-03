import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["tictactoe.nik-server.in"],
    proxy: {
      "/live": {
        target: "https://tictactoe.nik-server.in", // HTTPS target
        changeOrigin: true,
        secure: false, // allows self-signed certs in development
        // rewrite optional if backend does not expect /live
        // rewrite: (p) => p.replace(/^\/live/, ""),
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
