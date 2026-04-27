// One-shot iOS splash generator. Run via:
//   cd app
//   npm install --no-save sharp
//   node scripts/generate-splash.mjs
// Reads public/icons/splash-source.png (square art on black) and writes
// 5 portrait apple-touch-startup-image PNGs sized for current iPhones.
// Output is committed to git. Re-run if you swap splash-source.png.

import sharp from "sharp";

const SRC = "public/icons/splash-source.png";

// iPhone screen sizes that get device-specific splash links in app/layout.tsx.
const sizes = [
  { out: "public/icons/splash-1290x2796.png", w: 1290, h: 2796 }, // 14/15/16 Pro Max & Plus
  { out: "public/icons/splash-1179x2556.png", w: 1179, h: 2556 }, // 14/15/16 Pro
  { out: "public/icons/splash-1170x2532.png", w: 1170, h: 2532 }, // 14/15/16 + 12/13
  { out: "public/icons/splash-828x1792.png",  w: 828,  h: 1792 }, // XR / 11
  { out: "public/icons/splash-750x1334.png",  w: 750,  h: 1334 }, // SE 2/3, 8, 7, 6s, 6
];

// Goblin art occupies the full square. To leave breathing room on portrait
// splashes (and avoid a goblin that reaches the top/bottom edges), inset the
// art so it covers ~50% of the shorter screen dimension.
const ART_FRACTION = 0.5;

for (const { out, w, h } of sizes) {
  const artSize = Math.round(Math.min(w, h) * ART_FRACTION);
  const art = await sharp(SRC).resize(artSize, artSize, { fit: "contain" }).toBuffer();
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 0x0a, g: 0x0a, b: 0x0a }, // --void
    },
  })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${w}x${h}, art ${artSize}px)`);
}
