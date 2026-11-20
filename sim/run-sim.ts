// npm run sim -- --runs 5000 [--char gambler] [--stake 0]
import { writeFileSync } from 'node:fs';
import { playRun, type Bot, type RunResult } from './driver';
import { randomBot } from './bot-random';
import { greedyBot } from './bot-greedy';
import { RELIC_BY_ID } from '../src/data/relics';
import { CARD_BY_ID } from '../src/data/cards';
import { BAND_LABEL, type FlowBand } from '../src/rules/dda';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const RUNS = Number(arg('runs', '1000'));
const CHAR = arg('char', 'gambler');
const STAKE = Number(arg('stake', '0'));
const SEED0 = Number(arg('seed', '1000'));

function runMany(bot: Bot): RunResult[] {
  const out: RunResult[] = [];
  for (let i = 0; i < RUNS; i++) out.push(playRun(bot, SEED0 + i * 7919, CHAR, STAKE));
  return out;
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const f2 = (n: number) => n.toFixed(2);
const p1 = (n: number) => (n * 100).toFixed(1) + '%';

function summarize(name: string, rs: RunResult[]) {
  const deaths = new Map<string, number>();
  for (const r of rs) if (!r.won && r.deathBy) deaths.set(r.deathBy, (deaths.get(r.deathBy) ?? 0) + 1);
  const bands = new Map<FlowBand, number>();
  let bandTotal = 0;
  for (const r of rs) for (const b of r.bands) { bands.set(b, (bands.get(b) ?? 0) + 1); bandTotal++; }
  const relic = new Map<string, { n: number; w: number }>();
  for (const r of rs) for (const id of r.relics) { const o = relic.get(id) ?? { n: 0, w: 0 }; o.n++; if (r.won) o.w++; relic.set(id, o); }
  const acts = [1, 2, 3].map((a) => rs.filter((r) => r.act >= a).length / rs.length);
  const card = new Map<string, { n: number; w: number }>();
  for (const r of rs) for (const id of r.cards) { const o = card.get(id) ?? { n: 0, w: 0 }; o.n++; if (r.won) o.w++; card.set(id, o); }
  const a3 = rs.filter((r) => r.act >= 3);
  return {
    deck: avg(rs.map((r) => r.deckSize)),
    removals: avg(rs.map((r) => r.removals)),
    relicCount: avg(rs.map((r) => r.relicCount)),
    combats: avg(rs.map((r) => r.combats)),
    tier2: a3.filter((r) => r.maxTier >= 2).length / Math.max(1, a3.length),
    combo: a3.filter((r) => r.combos >= 1).length / Math.max(1, a3.length),
    card: [...card.entries()].filter(([, o]) => o.n >= Math.max(5, rs.length * 0.02)).map(([id, o]) => [id, o.n, o.w / o.n] as const).sort((a, b) => b[2] - a[2]),
    name,
    clear: rs.filter((r) => r.won).length / rs.length,
    nodes: avg(rs.map((r) => r.nodes)),
    yahtzee: avg(rs.map((r) => r.yahtzees)),
    jackpot: avg(rs.map((r) => r.jackpotTurns)),
    gambles: avg(rs.map((r) => r.gambles)),
    deaths: [...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    bands: [...bands.entries()].map(([b, n]) => [BAND_LABEL[b], n / Math.max(1, bandTotal)] as const),
    relic: [...relic.entries()].filter(([, o]) => o.n >= Math.max(5, rs.length * 0.01)).map(([id, o]) => [id, o.n, o.w / o.n] as const).sort((a, b) => b[2] - a[2]),
    acts,
  };
}

const t0 = Date.now();
const rnd = summarize('random', runMany(randomBot));
const grd = summarize('greedy', runMany(greedyBot));
const ratio = grd.nodes / Math.max(0.01, rnd.nodes);

const target = (ok: boolean) => (ok ? '✅' : '❌');
const lines: string[] = [];
lines.push(`# DICE MARKET 밸런스 시뮬레이션 리포트`, '');
lines.push(`- 판 수: 봇당 ${RUNS} · 캐릭터: ${CHAR} · 스테이크: ${STAKE} · 소요: ${((Date.now() - t0) / 1000).toFixed(1)}s`, '');
lines.push('## 목표 지표 (§7.4)', '', '| 지표 | 목표 | 결과 | |', '| --- | --- | --- | --- |');
lines.push(`| 숙련 봇 클리어율 | 35~50% | ${p1(grd.clear)} | ${target(grd.clear >= 0.35 && grd.clear <= 0.5)} |`);
lines.push(`| 랜덤 봇 평균 도달 노드 | 4~6 | ${f2(rnd.nodes)} | ${target(rnd.nodes >= 4 && rnd.nodes <= 6)} |`);
lines.push(`| 숙련/랜덤 도달 노드 비율 (R5) | ≥ 1.8 | ${f2(ratio)} | ${target(ratio >= 1.8)} |`);
lines.push(`| 판당 야찌 (숙련) | 0.3~0.6 | ${f2(grd.yahtzee)} | ${target(grd.yahtzee >= 0.3 && grd.yahtzee <= 0.6)} |`);
lines.push(`| 판당 잭팟 턴 (숙련) | 2~4 | ${f2(grd.jackpot)} | ${target(grd.jackpot >= 2 && grd.jackpot <= 4)} |`);
lines.push(`| 판당 도박 사용 (숙련) | ≥ 6 | ${f2(grd.gambles)} | ${target(grd.gambles >= 6)} |`);
lines.push(`| 판 종료 시 평균 덱 크기 | 18~26 | ${f2(grd.deck)} | ${target(grd.deck >= 18 && grd.deck <= 26)} |`);
lines.push(`| 판당 평균 카드 삭제 | ≥ 1.5 | ${f2(grd.removals)} | ${target(grd.removals >= 1.5)} |`);
lines.push(`| 판 종료 시 평균 유물 | — | ${f2(grd.relicCount)} | |`);
lines.push(`| 판당 평균 전투 | — | ${f2(grd.combats)} | |`);
lines.push(`| 3막 도달 판 중 태그 2단계 이상 | ≥ 60% | ${p1(grd.tier2)} | ${target(grd.tier2 >= 0.6)} |`);
lines.push(`| 3막 도달 판 중 숨은 콤보 1개 이상 | ≥ 50% | ${p1(grd.combo)} | ${target(grd.combo >= 0.5)} |`, '');
for (const s of [grd, rnd]) {
  lines.push(`## ${s.name} 봇`, '');
  lines.push(`- 클리어율 ${p1(s.clear)} · 평균 도달 노드 ${f2(s.nodes)} · 막 도달률 1막 ${p1(s.acts[0])} / 2막 ${p1(s.acts[1])} / 3막 ${p1(s.acts[2])}`);
  lines.push(`- 판당 야찌 ${f2(s.yahtzee)} · 잭팟 턴 ${f2(s.jackpot)} · 도박 ${f2(s.gambles)}`);
  lines.push(`- 사망 원인 상위 5: ${s.deaths.map(([n, c]) => `${n}(${c})`).join(', ') || '-'}`);
  lines.push(`- DDA 구간 체류: ${s.bands.map(([b, p]) => `${b} ${p1(p)}`).join(' · ')}`, '');
}
lines.push('## 유물별 채택 시 클리어율 (숙련 봇, 상위/하위)', '', '| 유물 | 채택 | 클리어율 |', '| --- | --- | --- |');
const rel = grd.relic;
for (const [id, n, w] of [...rel.slice(0, 8), ...rel.slice(-5)]) lines.push(`| ${RELIC_BY_ID[id]?.name ?? id} | ${n} | ${p1(w)} |`);
lines.push('', '## 카드별 채택 시 클리어율 (숙련 봇) — 평균 ±15%p 밖은 사기/함정', '', '| 카드 | 채택 | 클리어율 | 판정 |', '| --- | --- | --- | --- |');
for (const [id, n, w] of grd.card) {
  const d = w - grd.clear;
  lines.push(`| ${CARD_BY_ID[id]?.name ?? id} | ${n} | ${p1(w)} | ${d > 0.15 ? '🔥 사기' : d < -0.15 ? '🕳 함정' : ''} |`);
}
const md = lines.join('\n') + '\n';
writeFileSync(new URL('./report.md', import.meta.url), md);
console.log(md);
