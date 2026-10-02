import { resolve } from "node:path";
import { defineConfig } from "vite";

// nine pages: the looping piece at the root, and each mode once, plain and with controls
const pages = ["", "chain", "lines", "colocation", "howe", "all"].flatMap((m) => (m ? [m, `${m}/controls`] : [""]));
pages.push("texteffects", "jevving");
pages.push("crossings", "crossings/controls", "crossings-howe", "crossings-howe/controls", "crossings-howe-3d", "crossings-howe-3d/controls");  // standalone (not in the looping piece): Howe × Lines     // text effects library demo and the Jev scoring page (src/texteffects/)
export default defineConfig({
  base: process.env.BASE || "/",          // GitHub Pages serves the project under /poetry-chains/
  build: { rollupOptions: { input: Object.fromEntries(pages.map((p) => [p || "main", resolve(import.meta.dirname, p, "index.html")])) } },
});
