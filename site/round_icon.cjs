const sharp = require("sharp");
const fs = require("fs");

async function processImage() {
  const buf = fs.readFileSync("public/hero/favicon.ico");
  const img = sharp(buf);
  const metadata = await img.metadata();

  const width = metadata.width;
  const height = metadata.height;

  // Create a rounded rectangle SVG mask (22.5% radius like squircle)
  const r = Math.min(width, height) * 0.225;

  const roundedCorners = Buffer.from(
    `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}"/></svg>`,
  );

  const outBuffer = await img
    .composite([
      {
        input: roundedCorners,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  fs.writeFileSync("public/hero/favicon.ico", outBuffer);
  console.log("Rounded corners applied successfully.");
}

processImage().catch(console.error);
