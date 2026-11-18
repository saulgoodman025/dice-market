import type { MapNode, NodeType } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import { getMods, rng, type Ctx } from './ctx';
import { ddaNodeWeights } from './dda';

type NT = Exclude<NodeType, 'boss'>;

export function nodeWeights(ctx: Ctx): Record<NT, number> {
  const w = { ...BALANCE.nodeWeights };
  w.elite += getMods(ctx.run).eliteWeight;
  if (ctx.run.act === 1 && ctx.run.floor === 0) {
    w.elite = 0;
    w.casino = 0;
  }
  return ddaNodeWeights(ctx.run, w);
}

/** 현재 층의 선택지 생성 (층마다 독립, 도착 시 생성 → DDA 반영) */
export function genFloor(ctx: Ctx): MapNode[] {
  const run = ctx.run;
  if (run.floor >= BALANCE.floorsPerAct - 1) return [{ type: 'boss' }];
  const r = rng(ctx, 'map');
  const w = nodeWeights(ctx);
  const types = Object.keys(w) as NT[];
  const count = r.chance(0.5) ? 3 : 2;
  const out: MapNode[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ type: r.weighted(types, (t) => w[t]) });
  }
  // 1막 1층은 전투 포함
  if (run.act === 1 && run.floor === 0 && !out.some((n) => n.type === 'combat')) out[0] = { type: 'combat' };
  // 4층(보스 직전)은 상점 또는 휴식 보장
  if (run.floor === BALANCE.floorsPerAct - 2 && !out.some((n) => n.type === 'shop' || n.type === 'rest')) {
    out[out.length - 1] = { type: r.chance(0.5) ? 'shop' : 'rest' };
  }
  // 안전한 길: 도박이 아닌 노드가 항상 하나 (카지노만 있는 층 금지)
  if (out.every((n) => n.type === 'casino')) out[0] = { type: 'combat' };
  // 중복 제거 (같은 종류 2개면 하나 교체)
  const seen = new Set<NodeType>();
  for (let i = 0; i < out.length; i++) {
    if (seen.has(out[i].type)) out[i] = { type: r.weighted(types.filter((t) => !seen.has(t)), (t) => w[t] + 1) };
    seen.add(out[i].type);
  }
  return out;
}

export function pickEncounter(ctx: Ctx, tier: 'normal' | 'elite' | 'boss'): string[] {
  const act = ctx.run.act;
  const r = rng(ctx, 'map');
  const pool = ENEMIES.filter((e) => e.act === act && e.tier === tier);
  const def = r.pick(pool);
  const ids = Array(def.count ?? 1).fill(def.id);
  // 3막 후반 일반 전투는 가끔 2마리
  if (tier === 'normal' && act >= 2 && ctx.run.floor >= 2 && r.chance(0.25)) {
    const weak = pool.filter((e) => (e.count ?? 1) === 1 && e.hp <= 45 + (act - 2) * 20);
    if (weak.length) ids.push(r.pick(weak).id);
  }
  return ids;
}

export const NODE_INFO: Record<NodeType, { emoji: string; name: string; desc: string }> = {
  combat: { emoji: '⚔️', name: '전투', desc: '일반 적과 싸운다' },
  elite: { emoji: '💀', name: '엘리트', desc: '강적. 유물 보상' },
  shop: { emoji: '🛒', name: '상점', desc: '흥정하고 산다' },
  casino: { emoji: '🎰', name: '카지노', desc: '슬롯·룰렛·하이롤러' },
  event: { emoji: '❓', name: '이벤트', desc: '무슨 일이 생길까' },
  rest: { emoji: '🛏️', name: '휴식', desc: '회복 또는 강화' },
  boss: { emoji: '👑', name: '보스', desc: '막의 끝' },
};
