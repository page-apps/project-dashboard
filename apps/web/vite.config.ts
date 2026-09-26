import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

function readEnvironmentValue(key: string): string | undefined {
  return (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env
    .get(key) ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
      key
    ];
}

const basePath = readEnvironmentValue("VITE_BASE_PATH") ?? "/";

export default defineConfig({
  root: "./apps/web",
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "GitHub Project Control",
        short_name: "Project Control",
        description:
          "A GitHub dashboard PWA for tracking repositories, pull requests, and workflow health.",
        theme_color: "#10a37f",
        background_color: "#0d0d0d",
        display: "standalone",
        start_url: basePath,
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "apple-touch-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{css,html,js,svg,ico,png,webmanifest}"],
      },
    }),
  ],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["./src/**/*.unit.test.ts?(x)"],
          css: true,
        },
      },
      {
        test: {
          name: "integration",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["./src/**/*.integration.test.ts?(x)"],
          css: true,
        },
      },
    ],
  },
});
