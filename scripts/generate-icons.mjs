import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Create a simple blue rounded square with "A" letter
const createIcon = async (size) => {
  const cornerRadius = Math.round(size * 0.2); // 20% corner radius
  const fontSize = Math.round(size * 0.52);

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#0070f3"/>
      <text
        x="50%"
        y="62%"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
      >A</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
};

async function main() {
  console.log('Generating PNG icons...');

  // Generate 180x180 apple-touch-icon
  const icon180 = await createIcon(180);
  writeFileSync(join(iconsDir, 'apple-touch-icon.png'), icon180);
  console.log('Created apple-touch-icon.png (180x180)');

  // Generate 192x192 icon
  const icon192 = await createIcon(192);
  writeFileSync(join(iconsDir, 'icon-192.png'), icon192);
  console.log('Created icon-192.png (192x192)');

  // Generate 512x512 icon
  const icon512 = await createIcon(512);
  writeFileSync(join(iconsDir, 'icon-512.png'), icon512);
  console.log('Created icon-512.png (512x512)');

  console.log('Done!');
}

main().catch(console.error);
