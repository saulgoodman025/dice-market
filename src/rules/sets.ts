// 계열 태그 단계 · 숨은 콤보 · 증강 규칙
import type { AugmentOffer, RunState } from '../core/state';
import { AUGMENTS, AUGMENT_BY_ID, AUG_ODDS, type AugTier } from '../data/augments';
import { BALANCE } from '../data/balance';
import { CARD_BY_ID } from '../data/cards';
import { COMBOS, TAG_TIER_FX } from '../data/sets';
import { TAGS, TAG_INFO, TAG_TIERS, type Tag } from '../data/tags';
import { getMods, registerSources, rng, toast, type Ctx, type EffectSource } from './ctx';
import { addCurse, onDeckChange } from './economy';
import { cbOf, damageEnemy, gainChips, targetEnemy } from './ops';

// ───────────── 태그 ─────────────
/** 태그별 카운트 = 덱의 그 태그 카드 수 + 그 태그 증강 수 + 보너스 */
export function tagCounts(run: RunState): Record<Tag, number> {
  const out = Object.fromEntries(TAGS.map((t) => [t, 0])) as Record<Tag, number>;
  for (const c of run.deck) { const t = CARD_BY_ID[c.id]?.tag; if (t) out[t]++; }
  for (const a of run.augments) { const t = AUGMENT_BY_ID[a]?.tag; if (t) out[t]++; }
  // 다재다능 등 태그 보너스 (증강 mods만 — 단계 효과 자신은 제외해 순환을 막는다)
  for (const a of run.augments) for (const [t, n] of Object.entries(AUGMENT_BY_ID[a]?.mods?.tagBonus ?? {})) out[t as Tag] += n ?? 0;
  return out;
}

export function tierOf(count: number): number {
  return TAG_TIERS.filter((n) => count >= n).length;
}

/** 다음 단계까지 */
export function nextTierAt(count: number): number | null {
  return TAG_TIERS.find((n) => count < n) ?? null;
}

/** 전투 시작 시 단계 고정 (전투 중 덱 변화는 다음 전투부터) */
export function snapshotTiers(run: RunState) {
  const c = tagCounts(run);
  for (const t of TAGS) run.flags['tier_' + t] = tierOf(c[t]);
}

// ───────────── 콤보 ─────────────
export function activeCombos(run: RunState) {
  const ids = new Set(run.deck.map((c) => c.id));
  return COMBOS.filter((c) => ids.has(c.a) && ids.has(c.b));
}

/**
 * 덱이 바뀐 뒤 호출: 새로 켜진 콤보 발견 연출, 꺼진 콤보 안내, 태그 단계 상승 배너
 */
export function syncSets(ctx: Ctx) {
  const run = ctx.run;
  const on = new Set(activeCombos(run).map((c) => c.id));
  for (const c of COMBOS) {
    const was = run.flags['combo_' + c.id] === 1;
    if (on.has(c.id) && !was) {
      run.flags['combo_' + c.id] = 1;
      if (!run.flags['comboSeen_' + c.id]) {
        run.flags['comboSeen_' + c.id] = 1;
        ctx.emit({ t: 'combo', id: c.id });
      } else toast(ctx, `🔗 콤보 「${c.name}」 다시 켜짐`, 'good');
    } else if (!on.has(c.id) && was) {
      run.flags['combo_' + c.id] = 0;
      toast(ctx, `🔗 콤보 「${c.name}」 해제 (카드가 빠졌다)`, 'bad');
    }
  }
  const counts = tagCounts(run);
  for (const t of TAGS) {
    const tier = tierOf(counts[t]);
    const prev = run.flags['tierLive_' + t] ?? 0;
    if (tier > prev) ctx.emit({ t: 'tierUp', tag: t, tier });
    run.flags['tierLive_' + t] = tier;
  }
}

onDeckChange((ctx) => syncSets(ctx));

// ───────────── 효과 소스 등록: 태그 단계 + 콤보 + 증강 ─────────────
registerSources((run) => {
  const out: EffectSource[] = [];
  for (const t of TAGS) {
    const tier = run.flags['tier_' + t] ?? 0;
    for (let i = 0; i < tier; i++) out.push({ id: `tier_${t}_${i + 1}`, name: `${TAG_INFO[t].name} ${i + 1}단계`, ...TAG_TIER_FX[t][i].src });
  }
  for (const c of COMBOS) if (run.flags['combo_' + c.id] === 1) out.push({ id: 'combo_' + c.id, name: c.name, ...c.src });
  for (const a of run.augments) if (AUGMENT_BY_ID[a]) out.push(AUGMENT_BY_ID[a]);
  return out;
});

// ───────────── 증강 ─────────────
const TIERS: AugTier[] = ['silver', 'gold', 'prism'];

/** 이번 획득 시점의 등급 확률 [실버, 골드, 프리즘] */
export function augmentOdds(run: RunState, point: 'floor' | 'boss'): { label: string; w: [number, number, number]; ceiling: boolean } {
  const key = `${Math.min(3, run.act)}-${point === 'floor' ? '1' : 'b'}`;
  const row = AUG_ODDS.find((r) => r.key === key) ?? AUG_ODDS[AUG_ODDS.length - 1];
  // 프리즘 천장: 3막 1층까지 프리즘을 한 번도 못 봤으면 프리즘 확정
  const ceiling = run.act >= 3 && point === 'floor' && !run.flags.prismSeen;
  return { label: run.act > 3 ? `엔드리스 ${run.act}막` : row.label, w: ceiling ? [0, 0, 100] : row.w, ceiling };
}

function augPool(run: RunState, tier: AugTier, exclude: string[]): string[] {
  return AUGMENTS.filter((a) => a.tier === tier && !run.augments.includes(a.id) && !exclude.includes(a.id)
    && !(a.exclusive ?? []).some((x) => run.augments.includes(x))).map((a) => a.id);
}

/** 덱에서 가장 많은 태그 */
export function topTag(run: RunState): Tag | null {
  const c = tagCounts(run);
  const best = TAGS.slice().sort((a, b) => c[b] - c[a])[0];
  return c[best] > 0 ? best : null;
}

function rollAugIds(ctx: Ctx, tier: AugTier, n: number, keep: string[] = []): string[] {
  const r = rng(ctx, 'augment');
  const out: string[] = [];
  const tt = topTag(ctx.run);
  for (let i = 0; i < n; i++) {
    let pool = augPool(ctx.run, tier, [...out, ...keep]);
    // 태그 편향: 첫 장은 50% 확률로 덱에서 가장 많은 태그의 증강
    if (i === 0 && tt && r.chance(0.5)) {
      const biased = pool.filter((id) => AUGMENT_BY_ID[id].tag === tt);
      if (biased.length) pool = biased;
    }
    if (!pool.length) break;
    out.push(r.pick(pool));
  }
  return out;
}

export function offerAugment(ctx: Ctx, point: 'floor' | 'boss', then: AugmentOffer['then']) {
  const run = ctx.run;
  const odds = augmentOdds(run, point);
  const tier = rng(ctx, 'augment').weighted(TIERS, (t) => odds.w[TIERS.indexOf(t)]);
  if (tier === 'prism') run.flags.prismSeen = 1;
  const ids = rollAugIds(ctx, tier, 3);
  if (!ids.length) return;
  run.augmentOffer = { tier, ids, rerolled: ids.map(() => false), then };
  run.flags.augOffers = (run.flags.augOffers ?? 0) + 1;
}

export const AUG_REROLLS = 3;

export function augRerollsLeft(run: RunState): number {
  return AUG_REROLLS - (run.flags.augRerolls ?? 0);
}

/** 카드 하나만 다시 뽑기 (등급 유지, 판당 3회) */
export function rerollAugment(ctx: Ctx, i: number): boolean {
  const run = ctx.run;
  const of = run.augmentOffer;
  if (!of || !of.ids[i] || augRerollsLeft(run) <= 0) return false;
  const [id] = rollAugIds(ctx, of.tier, 1, of.ids);
  if (!id) return false;
  of.ids[i] = id;
  of.rerolled[i] = true;
  run.flags.augRerolls = (run.flags.augRerolls ?? 0) + 1;
  return true;
}

export const PRISM_ROULETTE = { chips: 3, win: 0.25 };

/** 골드 등급일 때만: 칩 3개 걸고 25% 프리즘 / 75% 실버 */
export function prismRoulette(ctx: Ctx): boolean | null {
  const run = ctx.run;
  const of = run.augmentOffer;
  if (!of || of.tier !== 'gold' || run.chips < PRISM_ROULETTE.chips || run.flags.prismRolled === run.flags.augOffers) return null;
  run.flags.prismRolled = run.flags.augOffers;
  gainChips(ctx, -PRISM_ROULETTE.chips);
  const win = rng(ctx, 'augment').next() < PRISM_ROULETTE.win;
  of.tier = win ? 'prism' : 'silver';
  if (win) run.flags.prismSeen = 1;
  of.ids = rollAugIds(ctx, of.tier, 3);
  of.rerolled = of.ids.map(() => false);
  return win;
}

export function pickAugment(ctx: Ctx, i: number) {
  const run = ctx.run;
  const of = run.augmentOffer;
  if (!of || !of.ids[i]) return;
  const id = of.ids[i];
  run.augments.push(id);
  run.augmentOffer = null;
  const d = AUGMENT_BY_ID[id];
  toast(ctx, `${d.icon} 증강 「${d.name}」`, d.tier === 'prism' ? 'gold' : 'good');
  d.hooks?.onAcquire?.(ctx, {});
  syncSets(ctx);
}

// ───────────── 카지노 파쇄기 룰렛 ─────────────
export function shredderOdds(run: RunState): number {
  return Math.min(1, BALANCE.shredderWin + getMods(run).casinoOdds / 100);
}

export function shredderLeft(run: RunState): number {
  return BALANCE.shredderMax - (run.flags.shredder ?? 0);
}

/** 고른 카드를 걸고 파쇄기: 성공하면 삭제, 실패하면 저주 카드 1장 추가 */
export function shredder(ctx: Ctx, uid: number): { win: boolean; curse: string | null } | null {
  const run = ctx.run;
  if (shredderLeft(run) <= 0 || run.chips < BALANCE.shredderChips) return null;
  const card = run.deck.find((c) => c.uid === uid);
  if (!card || run.deck.length - 1 < BALANCE.minDeck) return null;
  gainChips(ctx, -BALANCE.shredderChips);
  run.flags.shredder = (run.flags.shredder ?? 0) + 1;
  const r = rng(ctx, 'casino');
  const win = r.next() < shredderOdds(run);
  run.stats.gambles++;
  if (win) {
    run.deck = run.deck.filter((c) => c !== card);
    run.stats.removals++;
    syncSets(ctx);
    return { win, curse: null };
  }
  const curse = r.pick(['debtnote', 'badluck', 'withdrawal']);
  addCurse(ctx, curse);
  syncSets(ctx);
  return { win, curse };
}

// ───────────── 중앙은행 ─────────────
export function canCentralBank(ctx: Ctx): boolean {
  const cb = ctx.run.combat;
  return !!cb && cb.phase !== 'over' && getMods(ctx.run).centralBank > 0 && !cb.turnCounters.bank && cb.piggy > 0;
}

/** 저금통에서 amount를 꺼내 대상에게 1골드당 1 피해 */
export function centralBank(ctx: Ctx, amount: number): boolean {
  if (!canCentralBank(ctx)) return false;
  const cb = cbOf(ctx);
  const a = Math.max(1, Math.min(cb.piggy, Math.round(amount)));
  cb.piggy -= a;
  cb.turnCounters.bank = 1;
  const t = targetEnemy(cb);
  if (t) damageEnemy(ctx, t, a, { source: '중앙은행' });
  return true;
}
