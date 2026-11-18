import { describe, expect, it } from 'vitest';
import { newRun } from '../src/rules/run';
import {
  donChance, donEV, haggleOdds, mysteryOdds, rouletteOdds, scratchOdds, slotOdds, tumbleRoll, HIGHROLLER_P,
} from '../src/rules/casino';
import {
  DDA_TOUCHES, DISPLAYED_PROBABILITIES, ddaEnemyHpMult, ddaNodeWeights, ddaRarityBonus, ddaEliteRewardMult,
} from '../src/rules/dda';
import { rarityWeights } from '../src/rules/economy';
import { startCombat } from '../src/rules/combat';
import { BALANCE } from '../src/data/balance';
import type { RunState } from '../src/core/state';

function displayed(run: RunState) {
  return JSON.stringify({
    slot: slotOdds(run), roulette: rouletteOdds(run), don: [donChance(run), donEV(run)], haggle: haggleOdds(run),
    scratch: scratchOdds(run), mystery: mysteryOdds(), high: HIGHROLLER_P,
  });
}

describe('DDA는 표시 확률을 건드리지 않는다 (R3)', () => {
  it('DDA가 바꾸는 값과 표시 확률 목록이 겹치지 않는다', () => {
    const a = new Set<string>(DDA_TOUCHES);
    for (const d of DISPLAYED_PROBABILITIES) expect(a.has(d)).toBe(false);
  });

  it('흐름 지수가 바뀌어도 모든 표시 확률/EV가 동일하다', () => {
    const run = newRun(42, 'gambler');
    const base = displayed(run);
    for (const flow of [0, 20, 35, 50, 70, 95, 100]) {
      run.dda.flow = flow;
      run.dda.shopsSinceEpic = 12;
      expect(displayed(run)).toBe(base);
    }
  });

  it('흐름 지수가 바뀌어도 같은 시드의 전투 주사위 굴림 결과가 동일하다', () => {
    const rolls = (flow: number) => {
      const run = newRun(7, 'gambler');
      run.dda.flow = flow;
      const ctx = { run, emit: () => {} };
      startCombat(ctx, 'normal', ['bouncer']);
      return run.combat!.hand.map((h) => h.pip).join(',');
    };
    expect(rolls(5)).toBe(rolls(95));
  });

  it('흐름 지수가 바뀌어도 더블 오어 낫싱 굴림 시퀀스가 동일하다', () => {
    const seq = (flow: number) => {
      const run = newRun(99, 'gambler');
      run.dda.flow = flow;
      const ctx = { run, emit: () => {} };
      return Array.from({ length: 20 }, () => tumbleRoll(ctx).result).join('');
    };
    expect(seq(0)).toBe(seq(100));
  });

  it('보정 폭은 기본값의 ±20% 이내', () => {
    const run = newRun(1, 'gambler');
    for (const flow of [0, 30, 50, 70, 90]) {
      run.dda.flow = flow;
      expect(Math.abs(ddaEnemyHpMult(run) - 1)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(ddaEliteRewardMult(run) - 1)).toBeLessThanOrEqual(0.2);
      expect(ddaRarityBonus(run)).toBeLessThanOrEqual(20); // 가중치 총합 100 기준
      const w = ddaNodeWeights(run, BALANCE.nodeWeights);
      const tot = Object.values(BALANCE.nodeWeights).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(w) as (keyof typeof w)[]) expect(Math.abs(w[k] - BALANCE.nodeWeights[k])).toBeLessThanOrEqual(tot * 0.2);
    }
  });

  it('스테이크 3 이상에서는 하향(도움) 보정이 절반', () => {
    const run = newRun(1, 'gambler');
    run.dda.flow = 10;
    const full = ddaRarityBonus(run);
    run.stake = 3;
    expect(ddaRarityBonus(run)).toBe(full / 2);
  });

  it('DDA는 상점 등급 가중치에는 영향을 준다', () => {
    const run = newRun(1, 'gambler');
    run.dda.flow = 50;
    const a = rarityWeights(run);
    run.dda.flow = 10;
    const b = rarityWeights(run);
    expect(b.legendary).toBeGreaterThan(a.legendary);
  });
});
