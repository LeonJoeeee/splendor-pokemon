// 把卡表用到的官方插画下载到 public/sprites/(同源提供,局域网/国内手机可直接看)。
// 图片版权归原权利人;本目录 gitignore,不进仓库。运行:npm run sprites
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = '/Users/leon/Developer/poke';
const txt = readFileSync(`${ROOT}/src/data/cards.ts`, 'utf8');
const ids = [...new Set([...txt.matchAll(/"dexId":\s*(\d+)/g)].map((m) => Number(m[1])))].filter(Boolean);
const dir = `${ROOT}/public/sprites`;
mkdirSync(dir, { recursive: true });

const sources = (id) => [
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${id}.png`,
];

let ok = 0, fail = 0;
for (const id of ids) {
  const out = `${dir}/${id}.png`;
  if (existsSync(out)) { ok++; continue; }
  let buf = null;
  for (const url of sources(id)) {
    try { const r = await fetch(url); if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; } } catch { /* try next */ }
  }
  if (buf) { writeFileSync(out, buf); ok++; } else { fail++; console.error('FAIL', id); }
}
console.log(`sprites: ${ok}/${ids.length} ready, ${fail} failed -> ${dir}`);
