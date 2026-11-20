import type { MapNode, NodeType } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMIES, GROUPS } from '../data/enemies';
import { getMods, rng, type Ctx } from './ctx';
import { ddaNodeWeights } from './dda';

type NT = Exclude<NodeType, 'boss'>;

export function nodeWeights(ctx: Ctx, floor: number): Record<NT, number> {
  const w = { ...BALANCE.nodeWeights };
  w.elite += getMods(ctx.run).eliteWeight;
  if (ctx.run.act === 1 && floor === 0) {
    w.elite = 0;
    w.casino = 0;
  }
  return ddaNodeWeights(ctx.run, w);
}

const XS: Record<number, number[]> = { 1: [0.5], 2: [0.3, 0.7], 3: [0.17, 0.5, 0.83] };
const isSafeStop = (n: MapNode) => n.type === 'shop' || n.type === 'rest';

/** 한 층의 노드 종류 생성 */
export function genFloor(ctx: Ctx, floor: number): MapNode[] {
  const run = ctx.run;
  if (floor >= BALANCE.floorsPerAct - 1) return [{ type: 'boss', x: 0.5, next: [] }];
  const r = rng(ctx, 'map');
  const w = nodeWeights(ctx, floor);
  const types = Object.keys(w) as NT[];
  const count = r.chance(0.5) ? 3 : 2;
  const t: NodeType[] = [];
  for (let i = 0; i < count; i++) t.push(r.weighted(types, (k) => w[k]));
  // 1막 1층은 전투 포함
  if (run.act === 1 && floor === 0 && !t.includes('combat')) t[0] = 'combat';
  // 중복 제거 (같은 종류 2개면 하나 교체)
  const seen = new Set<NodeType>();
  for (let i = 0; i < t.length; i++) {
    if (seen.has(t[i])) t[i] = r.weighted(types.filter((k) => !seen.has(k)), (k) => w[k] + 1);
    seen.add(t[i]);
  }
  // 4층(보스 직전)은 상점 또는 휴식 보장
  if (floor === BALANCE.floorsPerAct - 2 && !t.some((k) => k === 'shop' || k === 'rest')) t[t.length - 1] = r.chance(0.5) ? 'shop' : 'rest';
  // 카지노만 있는 층 금지
  if (!t.some((k) => k !== 'casino')) t[0] = 'combat';
  return t.map((type, i) => ({ type, x: XS[t.length][i], next: [] }));
}

/** 막 전체 지도 생성: 층별 노드 + 다음 층으로 이어지는 갈림길 */
export function genActMap(ctx: Ctx): MapNode[][] {
  const r = rng(ctx, 'map');
  const floors: MapNode[][] = [];
  for (let f = 0; f < BALANCE.floorsPerAct; f++) floors.push(genFloor(ctx, f));
  for (let f = 0; f < floors.length - 1; f++) {
    const cur = floors[f];
    const nxt = floors[f + 1];
    // 가까운 노드끼리 연결
    for (const n of cur) {
      n.next = nxt.map((m, j) => [Math.abs(m.x - n.x), j] as const).filter(([d]) => d <= 0.36).map(([, j]) => j);
      if (!n.next.length) n.next = [nxt.map((m, j) => [Math.abs(m.x - n.x), j] as const).sort((a, b) => a[0] - b[0])[0][1]];
    }
    const incoming = (j: number) => cur.filter((n) => n.next.includes(j)).length;
    for (let j = 0; j < nxt.length; j++) {
      if (!incoming(j)) {
        const near = cur.map((n, i) => [Math.abs(n.x - nxt[j].x), i] as const).sort((a, b) => a[0] - b[0])[0][1];
        cur[near].next.push(j);
      }
    }
    // 갈림길 다양화: 여분의 연결을 일부 끊는다 (도착점이 고립되지 않게)
    for (const n of cur) {
      if (n.next.length > 1 && r.chance(0.45)) {
        const k = r.int(0, n.next.length - 1);
        if (incoming(n.next[k]) > 1) n.next.splice(k, 1);
      }
    }
    // 안전한 길: 모든 노드에서 카지노가 아닌 다음 노드가 하나는 있다
    for (const n of cur) {
      if (n.next.every((j) => nxt[j].type === 'casino')) {
        const alt = nxt.findIndex((m) => m.type !== 'casino');
        if (alt >= 0) n.next.push(alt);
      }
    }
    // 보스 직전 층: 모든 길이 상점 또는 휴식에 닿을 수 있다
    if (f === BALANCE.floorsPerAct - 3) {
      const safe = nxt.findIndex(isSafeStop);
      for (const n of cur) if (safe >= 0 && !n.next.some((j) => isSafeStop(nxt[j]))) n.next.push(safe);
    }
    for (const n of cur) n.next = [...new Set(n.next)].sort((a, b) => a - b);
  }
  return floors;
}

export function pickEncounter(ctx: Ctx, tier: 'normal' | 'elite' | 'boss'): string[] {
  const act = Math.min(3, ctx.run.act);
  const r = rng(ctx, 'map');
  // 엔드리스(4막~): 3막 적, 보스는 셋 중 무작위
  const pool = ENEMIES.filter((e) => (ctx.run.act > 3 && tier === 'boss' ? true : e.act === act) && e.tier === tier);
  if (tier !== 'normal') {
    const def = r.pick(pool);
    return Array(def.count ?? 1).fill(def.id);
  }
  // 일반 전투: 단독 등장 + 무리 등장 중 가중치로 고른다 (깊은 층일수록 무리가 많다)
  const floor = ctx.run.floor;
  const options: { ids: string[]; w: number }[] = pool.map((e) => ({ ids: Array(e.count ?? 1).fill(e.id), w: 1 }));
  for (const g of GROUPS) if (g.act === act && floor >= g.minFloor) options.push({ ids: g.ids, w: g.weight * (1 + floor * 0.25) });
  return [...r.weighted(options, (o) => o.w).ids];
}

export const NODE_INFO: Record<NodeType, { emoji: string; name: string; desc: string }> = {
  combat: { emoji: '⚔️', name: '전투', desc: '일반 적과 싸운다' },
  elite: { emoji: '💀', name: '엘리트', desc: '강적. 유물 보상' },
  shop: { emoji: '🏪', name: '상점', desc: '흥정하고 산다' },
  casino: { emoji: '🎰', name: '카지노', desc: '슬롯·룰렛·하이롤러' },
  event: { emoji: '❓', name: '이벤트', desc: '무슨 일이 생길까' },
  rest: { emoji: '🛏️', name: '휴식', desc: '회복 또는 강화' },
  boss: { emoji: '👑', name: '보스', desc: '막의 끝' },
};
