import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  define: { __STANDALONE__: JSON.stringify(process.env.STANDALONE === "1") },
});
