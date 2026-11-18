// 효과 시스템: 모든 효과는 훅(hooks) + 수치 보정(mods) 데이터로 정의된다.
// 특정 id를 if로 검사하지 않는다.
import { Rng, type Stream } from '../core/rng';
import type { Enemy, GameEvent, HandId, HandResult, RunState } from '../core/state';

export interface Ctx {
  run: RunState;
  emit: (e: GameEvent) => void;
}

export const rng = (ctx: Ctx, s: Stream) => new Rng(ctx.run.rng as unknown as Record<string, number>, s);

export interface Mods {
  rerolls: number;
  handAll: number;
  handAdd: Partial<Record<HandId, number>>;
  smallLadder: number;
  interestCap: number;
  interestUnit: number;
  piggyPct: number;
  shopDiscount: number;
  shopSlots: number;
  shopPricePct: number;
  donMaxStreak: number;
  donMinDelta: number;
  donFirstFailKeep: number;
  slotPairMult: number;
  slotSevenWeight: number;
  rouletteZeroWeight: number;
  payoutEv: number;
  haggleKeepOnOne: number;
  haggleCount: number;
  highrollerTier: number;
  casinoChips: number;
  scratchCols: number;
  shopFirstRerollFree: number;
  heatDmgExtra: number;
  startBlock: number;
  preview: number;
  enemyHpPct: number;
  startHpDelta: number;
  bossPhase2: number;
  eliteWeight: number;
  ddaHalfDown: number;
  turnNudge: number; // 손가락 튕기기 (±1)
  turnGodhand: number; // 신의 손
  locksmith: number;
  tumble: number;
  weighted: number;
  stackdeck: number;
  reflect: number;
  goldPerKill: number;
  firstTurnBlock: number;
  combatEndHeal: number;
  piggyChipsRatio: number;
}

export const ZERO_MODS = (): Mods => ({
  rerolls: 0, handAll: 0, handAdd: {}, smallLadder: 0, interestCap: 0, interestUnit: 0,
  piggyPct: 0, shopDiscount: 0, shopSlots: 0, shopPricePct: 0, donMaxStreak: 0, donMinDelta: 0,
  donFirstFailKeep: 0, slotPairMult: 0, slotSevenWeight: 0, rouletteZeroWeight: 0, payoutEv: 0,
  haggleKeepOnOne: 0, haggleCount: 0, highrollerTier: 0, casinoChips: 0, scratchCols: 0,
  shopFirstRerollFree: 0, heatDmgExtra: 0, startBlock: 0, preview: 0, enemyHpPct: 0, startHpDelta: 0,
  bossPhase2: 0, eliteWeight: 0, ddaHalfDown: 0, turnNudge: 0, turnGodhand: 0, locksmith: 0,
  tumble: 0, weighted: 0, stackdeck: 0, reflect: 0, goldPerKill: 0, firstTurnBlock: 0,
  combatEndHeal: 0, piggyChipsRatio: 0,
});

export interface HookArg {
  hand?: HandResult;
  win?: boolean;
  enemy?: Enemy;
  amount?: number;
  bought?: boolean;
  gamble?: string;
}

export type HookName =
  | 'onAcquire' | 'onCombatStart' | 'onTurnStart' | 'onRoll' | 'onReroll' | 'onPlace'
  | 'onSkill' | 'onHandScored' | 'onTurnEnd' | 'onCombatEnd' | 'onKill' | 'onShopEnter'
  | 'onShopLeave' | 'onNodeMove' | 'onGamble' | 'onGambleResult' | 'onPlayerHit' | 'onCasinoEnter';

export type HookFn = (ctx: Ctx, arg: HookArg) => void;

export interface EffectSource {
  id: string;
  name: string;
  mods?: Partial<Mods>;
  hooks?: Partial<Record<HookName, HookFn>>;
  /** 피해 배율 보정 (조건부) */
  dmgMult?: (ctx: Ctx) => number;
  /** 치명타를 막으면 true */
  saveLethal?: (ctx: Ctx) => boolean;
}

type SourceProvider = (run: RunState) => EffectSource[];
const providers: SourceProvider[] = [];
export function registerSources(p: SourceProvider) {
  providers.push(p);
}

export function sources(run: RunState): EffectSource[] {
  const out: EffectSource[] = [];
  for (const p of providers) out.push(...p(run));
  return out;
}

export function mergeMods(list: Partial<Mods>[]): Mods {
  const m = ZERO_MODS();
  for (const s of list) {
    for (const [k, v] of Object.entries(s)) {
      if (k === 'handAdd') {
        for (const [h, n] of Object.entries(v as Record<string, number>)) {
          m.handAdd[h as HandId] = (m.handAdd[h as HandId] ?? 0) + n;
        }
      } else {
        (m as unknown as Record<string, number>)[k] += v as number;
      }
    }
  }
  return m;
}

export function getMods(run: RunState): Mods {
  return mergeMods(sources(run).map((s) => s.mods ?? {}));
}

export function fire(ctx: Ctx, hook: HookName, arg: HookArg = {}): void {
  for (const s of sources(ctx.run)) s.hooks?.[hook]?.(ctx, arg);
}

export function toast(ctx: Ctx, text: string, tone: 'good' | 'bad' | 'info' | 'gold' = 'info') {
  ctx.emit({ t: 'toast', text, tone });
}
