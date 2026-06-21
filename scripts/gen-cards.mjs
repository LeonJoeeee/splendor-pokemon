// 从 /tmp/splendor.csv 生成 src/data/cards.ts，并从 PokéAPI 补全 dexId 与中文名。
import { readFileSync, writeFileSync } from 'node:fs';

const CSV = '/tmp/splendor.csv';
const OUT = '/Users/leon/Developer/poke/src/data/cards.ts';

const COLOR = { Red: 'red', Blue: 'blue', Black: 'black', Pink: 'pink', Yellow: 'yellow', Purple: 'master' };
const NAME_OVERRIDE = { Nidoran: 'nidoran-f' }; // CSV 的 Nidoran 为雌性线(→Nidorina→Nidoqueen)

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (const line of lines) {
    const fields = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    rows.push(fields.map((f) => f.trim()));
  }
  return rows;
}

function parseCost(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d+)\s+(\w+)$/);
    if (!m) continue;
    out[COLOR[m[2]]] = Number(m[1]);
  }
  return out;
}

function kebab(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const rows = parseCsv(readFileSync(CSV, 'utf8'));
const header = rows[0];
const idx = (h) => header.indexOf(h);
const iStage = idx('Stage'), iName = idx('Name'), iPts = idx('Points'),
  iCost = idx('Cost'), iEvo = idx('Evolve Cost'), iTo = idx('Evolves To'), iBonus = idx('Bonus');

const dataRows = rows.slice(1);
const species = [...new Set(dataRows.map((r) => r[iName]))];

// 拉取 dexId + 中文名
const meta = {};
await Promise.all(species.map(async (sp) => {
  const slug = NAME_OVERRIDE[sp] ?? sp.toLowerCase();
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${slug}`);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const zh = j.names.find((n) => n.language.name === 'zh-hans')?.name
      ?? j.names.find((n) => n.language.name === 'zh-hant')?.name ?? sp;
    meta[sp] = { dexId: j.id, nameZh: zh };
  } catch (e) {
    console.error(`! ${sp} (${slug}): ${e.message}`);
    meta[sp] = { dexId: 0, nameZh: sp };
  }
}));

const speciesId = (name) => name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

const cards = dataRows.map((r, i) => {
  const stageRaw = r[iStage];
  const kind = stageRaw === 'Rare' ? 'rare' : stageRaw === 'Legendary' ? 'legendary' : 'normal';
  const stage = kind === 'normal' ? Number(stageRaw) : 3;
  const name = r[iName];
  const bonusM = r[iBonus].match(/^(\d+)\s+(\w+)$/);
  const card = {
    id: `${kebab(name)}-${i}`,
    speciesId: speciesId(name),
    name,
    nameZh: meta[name].nameZh,
    dexId: meta[name].dexId,
    kind,
    stage,
    cost: parseCost(r[iCost]),
    bonus: COLOR[bonusM[2]],
    bonusAmount: Number(bonusM[1]),
    points: r[iPts] ? Number(r[iPts]) : 0,
  };
  if (kind === 'normal' && stage < 3 && r[iTo]) {
    card.evolveCost = parseCost(r[iEvo]);
    card.evolvesToSpeciesId = speciesId(r[iTo]);
  }
  return card;
});

const banner = `// 自动生成，勿手改。源:社区整理的《璀璨宝石:宝可梦版》卡表(BGG 社区转录,逐张数值待对实体卡校对)。
// 由 scripts/gen-cards (读 /tmp/splendor.csv + PokéAPI dexId/中文名) 生成。
// 本仓库不打包官方卡图;插画运行时按 dexId 从 PokéAPI 拉取。`;

const body = `${banner}\nimport type { Card } from '../engine/types';\n\nexport const CARDS: Card[] = ${JSON.stringify(cards, null, 2)};\n`;
writeFileSync(OUT, body);
console.log(`wrote ${cards.length} cards → ${OUT}`);
const dist = {};
for (const c of cards) dist[c.kind === 'normal' ? `stage${c.stage}` : c.kind] = (dist[c.kind === 'normal' ? `stage${c.stage}` : c.kind] ?? 0) + 1;
console.log('distribution:', JSON.stringify(dist));
const noDex = cards.filter((c) => !c.dexId).map((c) => c.name);
if (noDex.length) console.log('MISSING DEX:', [...new Set(noDex)].join(', '));
