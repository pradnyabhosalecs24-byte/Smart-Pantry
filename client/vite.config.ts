import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const securityHeaders = JSON.parse(readFileSync(new URL("./security-headers.json", import.meta.url), "utf8")) as Record<string, string>;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Installable app + offline shell. API responses are never cached, so data is always live.
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Smart Pantry Manager",
          short_name: "Smart Pantry",
          description: "Track pantry items, expiry dates and food waste.",
          theme_color: "#2F7D4F",
          background_color: "#F6F3EA",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          // Push notification handlers (public/push-sw.js)
          importScripts: ["/push-sw.js"],
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        },
      }),
    ],
    server: {
      port: 5173,
      // Same-origin /api in development: the auth cookie stays first-party, no CORS needed
      proxy: { "/api": { target: env.VITE_API_PROXY || "http://localhost:4000", changeOrigin: true } },
    },
    // `npm run preview` sends the production security headers, so the policy can be checked before deploying
    preview: { port: 4173, headers: securityHeaders, proxy: { "/api": { target: env.VITE_API_PROXY || "http://localhost:4000", changeOrigin: true } } },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("html5-qrcode")) return "scanner";
          },
        },
      },
    },
  };
});
