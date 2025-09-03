import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/live/", // ensures assets load under /live
  server: {
    host: "::",
    port: 8080,
    // Optional: proxy API requests to backend
    proxy: {
      "/api": {
        target: "https://tictactoe.nik-server.in",
        changeOrigin: true,
        secure: false, // allows self-signed certs in development
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
