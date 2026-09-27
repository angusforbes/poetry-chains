import { resolve } from "node:path";
import { defineConfig } from "vite";

// nine pages: the looping piece at the root, and each mode once, plain and with controls
const pages = ["", "chain", "lines", "colocation", "howe"].flatMap((m) => (m ? [m, `${m}/controls`] : [""]));
export default defineConfig({
  base: process.env.BASE || "/",          // GitHub Pages serves the project under /poetry-chains/
  build: { rollupOptions: { input: Object.fromEntries(pages.map((p) => [p || "main", resolve(import.meta.dirname, p, "index.html")])) } },
});
