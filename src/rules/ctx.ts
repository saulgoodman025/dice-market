// 효과 시스템: 모든 효과는 훅(hooks) + 수치 보정(mods) 데이터로 정의된다.
// 특정 id를 if로 검사하지 않는다.
import { Rng, type Stream } from '../core/rng';
import type { CardInst, Enemy, GameEvent, HandId, HandResult, RunState } from '../core/state';
import type { Tag } from '../data/tags';
import type { Cond } from '../data/cond';

export interface Ctx {
  run: RunState;
  emit: (e: GameEvent) => void;
}

export const rng = (ctx: Ctx, s: Stream) => new Rng(ctx.run.rng as unknown as Record<string, number>, s);

export interface Mods {
  rerolls: number;
  lockLimit: number;
  handChips: number;
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
  // ── 덱 ──
  drawPerTurn: number;
  handMax: number;
  firstTurnDraw: number;
  burnDraw: number;
  removeDiscount: number; // 상점 카드 삭제 할인 (G)
  tagBonus: Partial<Record<Tag, number>>;
  gambleOdds: number; // 도박 카드 성공 확률 +%p (표시 반영)
  cardRewardChoices: number;
  // ── 증강 ──
  atkFlat: number; // 공격 카드 피해 +N
  blockFlat: number; // 방어 카드 방어 +N
  poisonAdd: number; // 독을 걸 때 +N
  killHeal: number;
  turnBlock: number; // 매 턴 시작 방어
  jackpotGainPct: number;
  rewardGold: number; // 전투 보상 골드 +N
  shopFreeCard: number;
  combatPiggy: number; // 전투 시작 저금통
  rhythm: number; // 매 턴 3번째 카드 비용 -1
  freeRet: number; // 주사위를 돌려받는 카드 비용 0
  casinoOdds: number; // 카지노 장치 표시 확률 +%p
  handDrawMin: number; // 족보 드로우 기준 완화 (원 페어)
  strMult: number; // 힘 배율 가산
  // ── 태그 단계 / 증강 공용 ──
  freeFromNth: number; // 한 턴에 N번째 카드부터 비용 0 (0 = 없음)
  drawOnNth: number; // 한 턴에 N번째 카드를 쓰면 1장 뽑기 (0 = 없음)
  debuffTurns: number; // 내가 거는 약화·취약 지속 +N턴
  poisonSlow: number; // 독이 2턴에 1씩만 줄어듦
  poisonSplash: number; // 독 피해의 %가 다른 무작위 적에게
  poisonAll: number; // 독 피해가 모든 적에게 동시에
  blockCarryPct: number; // 남은 방어도의 %가 다음 턴으로
  blockPersistCap: number; // 방어도가 사라지지 않음 (상한, 0 = 없음)
  blockToDmgPct: number; // 방어도를 얻을 때마다 무작위 적에게 %만큼 피해
  gambleFailJackpot: number; // 도박 실패 시 잭팟 +%
  gambleWinMult: number; // 도박 성공 효과 배율 가산 (0.5 → ×1.5)
  gambleWinDraw: number;
  piggyBlockPct: number; // 턴 시작마다 저금통의 %만큼 방어
  firstAtkDraw: number; // 매 턴 첫 공격 카드 사용 시 1장 뽑기
  firstAtkTwice: number; // 매 턴 첫 공격 카드가 2번 발동
  firstAtkPct: number; // 매 턴 첫 공격 카드 피해 +%
  retDraw: number; // 주사위를 돌려받는 카드 사용 시 1장 뽑기 (턴당 2회)
  noneAsPair: number; // 노 핸드를 원 페어로 판정
  reflectMult: number; // 반사·반격 피해 배율 가산 (1 → ×2)
  cutsStr: number; // 천 개의 칼날 타격마다 힘 +1 (1턴)
  frailExtra: number; // 약화된 적 피해 추가 감소
  reflectAdd: number; // 반사·반격 피해 +N
  vulnExtra: number; // 취약 배율 가산
  spikes: number; // 방어도가 깎일 때마다 공격자에게 N 피해
  upAtkPct: number; // 강화된 공격 카드 피해 +%
  upBlockPct: number; // 강화된 방어 카드 방어 +%
  ironwill: number; // 전투당 1번, 방어도 30 이상이면 공격 무효
  fallacy: number; // 도박 3연속 실패 후 확정 성공
  gambleFailHalf: number; // 도박 실패해도 50% 효과
  straightFlush: number;
  fourIsYahtzee: number;
  centralBank: number;
  collector: number;
  minimalist: number;
}

export const ZERO_MODS = (): Mods => ({
  rerolls: 0, lockLimit: 0, handChips: 0, handAll: 0, handAdd: {}, smallLadder: 0, interestCap: 0, interestUnit: 0,
  piggyPct: 0, shopDiscount: 0, shopSlots: 0, shopPricePct: 0, donMaxStreak: 0, donMinDelta: 0,
  donFirstFailKeep: 0, slotPairMult: 0, slotSevenWeight: 0, rouletteZeroWeight: 0, payoutEv: 0,
  haggleKeepOnOne: 0, haggleCount: 0, highrollerTier: 0, casinoChips: 0, scratchCols: 0,
  shopFirstRerollFree: 0, heatDmgExtra: 0, startBlock: 0, preview: 0, enemyHpPct: 0, startHpDelta: 0,
  bossPhase2: 0, eliteWeight: 0, ddaHalfDown: 0, turnNudge: 0, turnGodhand: 0, locksmith: 0,
  tumble: 0, weighted: 0, stackdeck: 0, reflect: 0, goldPerKill: 0, firstTurnBlock: 0,
  combatEndHeal: 0, piggyChipsRatio: 0,
  drawPerTurn: 0, handMax: 0, firstTurnDraw: 0, burnDraw: 0, removeDiscount: 0, tagBonus: {}, gambleOdds: 0, cardRewardChoices: 0,
  atkFlat: 0, blockFlat: 0, poisonAdd: 0, killHeal: 0, turnBlock: 0, jackpotGainPct: 0, rewardGold: 0, shopFreeCard: 0, combatPiggy: 0,
  rhythm: 0, freeRet: 0, casinoOdds: 0, handDrawMin: 0, strMult: 0,
  freeFromNth: 0, drawOnNth: 0, debuffTurns: 0, poisonSlow: 0, poisonSplash: 0, poisonAll: 0, blockCarryPct: 0, blockPersistCap: 0,
  blockToDmgPct: 0, gambleFailJackpot: 0, gambleWinMult: 0, gambleWinDraw: 0, piggyBlockPct: 0, firstAtkDraw: 0, firstAtkTwice: 0, firstAtkPct: 0, retDraw: 0,
  noneAsPair: 0, reflectMult: 0, cutsStr: 0, frailExtra: 0, reflectAdd: 0, vulnExtra: 0, spikes: 0, upAtkPct: 0, upBlockPct: 0,
  ironwill: 0, fallacy: 0, gambleFailHalf: 0, straightFlush: 0, fourIsYahtzee: 0, centralBank: 0, collector: 0, minimalist: 0,
});

export interface HookArg {
  hand?: HandResult;
  win?: boolean;
  enemy?: Enemy;
  amount?: number;
  bought?: boolean;
  gamble?: string;
  card?: CardInst;
}

export type HookName =
  | 'onAcquire' | 'onCombatStart' | 'onTurnStart' | 'onRoll' | 'onReroll' | 'onPlace'
  | 'onSkill' | 'onHandScored' | 'onTurnEnd' | 'onCombatEnd' | 'onKill' | 'onShopEnter'
  | 'onShopLeave' | 'onNodeMove' | 'onGamble' | 'onGambleResult' | 'onPlayerHit' | 'onCasinoEnter'
  | 'onCardPlay' | 'onDraw' | 'onGambleCard' | 'onBlockGain' | 'onPoisonTick';

export type HookFn = (ctx: Ctx, arg: HookArg) => void;

/** 특정 카드의 수치·규칙 덮어쓰기 (숨은 콤보 등) */
export interface CardOverride {
  v?: Record<string, number>; // 값 덮어쓰기
  vAdd?: Record<string, number>; // 값 더하기
  cost?: number;
  perCombat?: number;
  condVuln?: Cond; // 대상이 취약이면 이 조건으로
  choose?: 'value';
}

export interface EffectSource {
  id: string;
  name: string;
  mods?: Partial<Mods>;
  cards?: Record<string, CardOverride>;
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
      } else if (k === 'tagBonus') {
        for (const [h, n] of Object.entries(v as Record<string, number>)) {
          m.tagBonus[h as Tag] = (m.tagBonus[h as Tag] ?? 0) + n;
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
