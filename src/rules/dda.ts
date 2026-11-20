// 동적 난이도 보정. 표시되는 확률(굴림/슬롯/룰렛/더블오어낫싱/스크래치/미스터리)은 절대 건드리지 않는다.
import type { NodeType, RunState } from '../core/state';

/** DDA가 바꿀 수 있는 값 */
export const DDA_TOUCHES = ['shopRarityWeights', 'mapNodeWeights', 'enemyHp', 'eliteReward', 'highrollerRewardTier'] as const;
/** 화면에 확률이 표시되는 값 (DDA 금지) */
export const DISPLAYED_PROBABILITIES = ['combatDice', 'slot', 'roulette', 'doubleOrNothing', 'scratch', 'mysteryBox'] as const;

export type FlowBand = 'despair' | 'struggle' | 'flow' | 'cruise' | 'dominate';

const RARITY_SCORE: Record<string, number> = { common: 3, rare: 8, epic: 15, legendary: 30 };

export function computeFlow(run: RunState, relicRarity: (id: string) => string): number {
  const hpRatio = (run.hp / Math.max(1, run.maxHp)) * 100;
  const rs = run.dda.recentScores.slice(-3);
  const recent = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 60;
  const relicScore = run.relics.reduce((s, r) => s + (RARITY_SCORE[relicRarity(r)] ?? 0), 0);
  const expected = 15 + run.nodesReached * 8;
  const asset = Math.min(100, ((run.gold + relicScore) / expected) * 50);
  const ts = run.dda.combatsTurns.slice(-3);
  const avgTurns = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 4;
  const turnEff = Math.max(0, Math.min(100, 100 - (avgTurns - 3) * 15));
  const flow = 0.4 * hpRatio + 0.3 * recent + 0.2 * asset + 0.1 * turnEff;
  return Math.round(Math.max(0, Math.min(100, flow)));
}

export function band(flow: number): FlowBand {
  if (flow <= 25) return 'despair';
  if (flow <= 40) return 'struggle';
  if (flow <= 60) return 'flow';
  if (flow <= 80) return 'cruise';
  return 'dominate';
}

export const BAND_LABEL: Record<FlowBand, string> = {
  despair: '포기 직전', struggle: '고전', flow: '몰입', cruise: '순항', dominate: '압도',
};

const assistScale = (run: RunState) => (run.stake >= 3 ? 0.5 : 1);

/** 상점 상위 등급 가중치 보너스 (가중치 총합 100 기준 ±20 이내) */
export function ddaRarityBonus(run: RunState): number {
  const b = band(run.dda.flow);
  if (b === 'despair') return 15 * assistScale(run);
  if (b === 'struggle') return 7 * assistScale(run);
  return 0;
}

export function ddaEnemyHpMult(run: RunState): number {
  return band(run.dda.flow) === 'despair' ? 1 - 0.15 * assistScale(run) : 1;
}

export function ddaNodeWeights(run: RunState, w: Record<Exclude<NodeType, 'boss'>, number>): Record<Exclude<NodeType, 'boss'>, number> {
  const o = { ...w };
  const b = band(run.dda.flow);
  if (b === 'despair' || b === 'struggle') {
    const s = assistScale(run);
    o.rest += 6 * s;
    o.shop += 6 * s;
  } else if (b === 'cruise') o.elite += 6;
  else if (b === 'dominate') o.casino += 6;
  return o;
}

export function ddaEliteRewardMult(run: RunState): number {
  return band(run.dda.flow) === 'cruise' ? 1.2 : 1;
}

export function ddaHighrollerBonus(run: RunState): number {
  return band(run.dda.flow) === 'dominate' ? 1 : 0;
}

export function ddaForceShopEpic(run: RunState): boolean {
  return run.dda.shopsSinceEpic >= 10 || run.dda.forceEpic;
}

export function ddaShopIncludesPotion(run: RunState): boolean {
  return band(run.dda.flow) === 'despair';
}

export function combatScore(dmgTaken: number, maxHp: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - (dmgTaken / Math.max(1, maxHp)) * 200)));
}
