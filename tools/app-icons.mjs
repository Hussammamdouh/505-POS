// Builds the app icon, Android adaptive icon layers, splash image and favicon from the brand art
// (assets/logo.jpg = "505 Coffee & Love", assets/logo second.jpg = the mascot; white on black, A4).
// Run again after changing the art: `npm run app-icons`. Icon and splash changes need a new native build.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asset = (name) => join(root, 'assets', name);
// The page colour of the logo files, so the art blends in with no visible box.
const BLACK = '#040205';

/** The bounding box of the light artwork on the dark page. */
async function loadArt(file) {
  const image = await loadImage(asset(file));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const offset = (y * image.width + x) * 4;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 60) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return { image, box: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}

/** The artwork centred on a square canvas, filling `fill` of its side. */
function render({ image, box }, size, fill, { background = BLACK, monochrome = false } = {}) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
  }

  const scale = (size * fill) / Math.max(box.width, box.height);
  const width = box.width * scale;
  const height = box.height * scale;
  context.drawImage(image, box.x, box.y, box.width, box.height, (size - width) / 2, (size - height) / 2, width, height);

  if (monochrome) {
    // Android themed icons: the light artwork as solid white on transparent.
    const pixels = context.getImageData(0, 0, size, size);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const light = Math.max(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]);
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 255;
      pixels.data[offset + 3] = light;
    }
    context.putImageData(pixels, 0, 0);
  }

  return canvas.toBuffer('image/png');
}

function solid(size, color) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return canvas.toBuffer('image/png');
}

const wordmark = await loadArt('logo.jpg');
const mascot = await loadArt('logo second.jpg');

const outputs = {
  'icon.png': render(wordmark, 1024, 0.72),
  // Android crops adaptive icons to a circle or squircle; keep the art inside the middle 66%.
  'android-icon-foreground.png': render(wordmark, 1024, 0.56, { background: null }),
  'android-icon-background.png': solid(1024, BLACK),
  'android-icon-monochrome.png': render(wordmark, 1024, 0.56, { background: null, monochrome: true }),
  'splash-icon.png': render(mascot, 1024, 0.92, { background: null }),
  'favicon.png': render(wordmark, 48, 0.86),
};

for (const [name, png] of Object.entries(outputs)) {
  writeFileSync(asset(name), png);
  console.log(`assets/${name}`);
}
