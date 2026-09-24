import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Zet een versie in de service worker bij elke build. De cachenaam moet per
 * build veranderen, anders blijft oude inhoud staan én ziet de browser geen
 * nieuwe worker (die vergelijkt het bestand byte voor byte).
 * Geen plug-in uit npm: Lovable beheert de lockfile.
 */
function stampServiceWorker(): Plugin {
  return {
    name: "nomadix-sw-version",
    apply: "build",
    closeBundle() {
      const file = path.resolve(__dirname, "dist/sw.js");
      if (!fs.existsSync(file)) return;
      const version = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("__SW_VERSION__", version));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), stampServiceWorker()].filter(
    Boolean,
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
