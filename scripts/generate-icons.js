import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

function createIcon(size, isMaskable = false) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;
  const moonR = size * 0.28;
  const moonCY = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      
      // Background gradient (midnight dark navy)
      const grad = y / size;
      let r = Math.round(15 + 10 * (1 - grad));
      let g = Math.round(23 + 15 * (1 - grad));
      let b = Math.round(42 + 40 * (1 - grad));
      let a = 255;

      // Distance to moon center
      const dx = x - center;
      const dy = y - moonCY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Moon glow
      if (dist < moonR * 1.5) {
        const glowFactor = Math.max(0, 1 - (dist - moonR) / (moonR * 0.5));
        r = Math.min(255, r + Math.round(240 * glowFactor * 0.4));
        g = Math.min(255, g + Math.round(200 * glowFactor * 0.4));
        b = Math.min(255, b + Math.round(100 * glowFactor * 0.2));
      }

      // Moon core
      if (dist <= moonR) {
        r = 254;
        g = 240;
        b = 138;
      }

      // Wolf howling silhouette in front of moon
      const wx = (x - center) / (size * 0.4);
      const wy = (y - size * 0.52) / (size * 0.4);
      if (wy > -0.6 && wy < 0.6 && wx > -0.4 && wx < 0.3) {
        // silhouette approximation
        if (wy > -wx * 1.2 - 0.2 && wy < 0.5 && wx > -0.25) {
          r = 2;
          g = 6;
          b = 23;
        }
      }

      // Ground silhouette
      if (y > size * 0.78) {
        r = 15;
        g = 23;
        b = 42;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

const pubDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), createIcon(192));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), createIcon(512));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), createIcon(512, true));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), createIcon(180));
console.log('Successfully generated PNG icons for PWA compliance');
