// One-shot icon generator. Run via:
//   cd app
//   npm install --no-save sharp png-to-ico
//   node scripts/generate-icons.mjs
// Reads public/icons/source.png and writes the derived PNG set + favicon.ico.
// Re-run if you swap source.png. Output is committed to git.
// (--no-save keeps sharp/png-to-ico out of package.json — they're one-shot
//  build-time deps, not runtime. node_modules entries don't pollute git.)

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "public/icons/source.png";

const sizes = [
  { out: "public/icons/icon-192.png", size: 192 },
  { out: "public/icons/icon-512.png", size: 512 },
  { out: "public/icons/apple-touch-icon.png", size: 180 },
  { out: "public/icons/favicon-32.png", size: 32 },
  { out: "public/icons/favicon-16.png", size: 16 },
];

for (const { out, size } of sizes) {
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}

// favicon.ico — multi-resolution (32 + 16) ICO
const ico = await pngToIco([
  readFileSync("public/icons/favicon-32.png"),
  readFileSync("public/icons/favicon-16.png"),
]);
writeFileSync("public/favicon.ico", ico);
console.log("wrote public/favicon.ico (32+16 multi-res)");
