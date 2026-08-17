import { fileURLToPath, URL } from "node:url"

import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"
import { visualizer } from "rollup-plugin-visualizer"

const shouldAnalyze = process.env.ANALYZE === "true"

export default defineConfig({
  plugins: [
    vue(),
    ...(shouldAnalyze
      ? [
          visualizer({
            filename: "stats.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("motion-v") || id.includes("@motionone"))
              return "motion"
            if (id.includes("qrcode")) return "qrcode"
            if (id.includes("lucide-vue-next")) return "icons"
            if (id.includes("@supabase")) return "supabase"
            if (
              id.includes("/vue/") ||
              id.includes("/vue-router/") ||
              id.includes("/pinia/")
            ) {
              return "vue-core"
            }
            return
          }

          if (
            id.includes("/src/components/game-manage/") ||
            id.includes("/src/components/library/") ||
            id.includes("/src/components/past-sessions/") ||
            id.includes("/src/components/game-builder/") ||
            id.includes("/src/views/GameBuilderView") ||
            id.includes("/src/views/GameManageView") ||
            id.includes("/src/views/LibraryView") ||
            id.includes("/src/views/PastSessionsView") ||
            id.includes("/src/views/WalkthroughView")
          ) {
            return "host-only"
          }
          return
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "**/*.test.ts",
        "src/test/**",
        "src/main.ts",
        "src/router/**",
        "src/types/**",
        "src/i18n/**",
        "**/*.d.ts",
        "**/node_modules/**",
        "*.config.ts",
        "src/assets/**",
      ],
    },
  },
})
