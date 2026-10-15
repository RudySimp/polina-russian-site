import { routeMetadata, pageHtml } from "./src/route-metadata.ts";
import { defineConfig } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routes } from "./src/routes.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  base: "/polina-russian-site/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  plugins: [
    {
      name: "known-static-pages",
      writeBundle() {
        const dist = resolve(root, "dist");
        const html = readFileSync(resolve(dist, "index.html"), "utf8");
        writeFileSync(
          resolve(dist, "index.html"),
          pageHtml(html, routeMetadata("/")),
        );
        for (const route of routes.filter((route) => route !== "/")) {
          const directory = resolve(dist, route.slice(1));
          mkdirSync(directory, { recursive: true });
          writeFileSync(
            resolve(directory, "index.html"),
            pageHtml(html, routeMetadata(route)),
          );
        }
        writeFileSync(resolve(dist, "404.html"), html);
        writeFileSync(resolve(dist, "routes.json"), JSON.stringify(routes));
      },
    },
  ],
});
