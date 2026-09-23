import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "story-data.js",
  "manifest.webmanifest",
  "sw.js",
  "public",
];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

for (const file of files) {
  await fs.cp(path.join(root, file), path.join(output, file), { recursive: true });
}

await fs.writeFile(path.join(output, ".nojekyll"), "");
console.log(`Built static GitHub Pages site at ${output}`);
