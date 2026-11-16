// Генерує PNG-іконки розширення з icons/icon.svg у public/icons/.
// Запуск: npm run icons (потрібен лише після зміни icon.svg; PNG зберігаються в репозиторії).
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}icons/icon.svg`, 'utf8');
const outDir = `${root}public/icons`;
mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`${outDir}/icon-${size}.png`, png);
  console.log(`icons/icon-${size}.png`);
}
