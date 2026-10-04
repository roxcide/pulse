import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
