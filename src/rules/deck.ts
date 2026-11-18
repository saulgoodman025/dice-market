// 덱 규칙: 셔플 · 드로우 · 버림 · 소멸 · 주사위 태우기
import type { CardInst, CombatState, RunState } from '../core/state';
import { BALANCE } from '../data/balance';
import { CARD_BY_ID, resolveCard } from '../data/cards';
import { CHAR_BY_ID } from '../data/characters';
import { fire, getMods, rng, toast, type Ctx } from './ctx';
import { cbOf } from './ops';

/** 시작 덱: 베기 ×4, 방패 ×4, 캐릭터 시작 카드 */
export function startDeck(run: RunState): CardInst[] {
  const ch = CHAR_BY_ID[run.charId];
  const ids = [...Array(BALANCE.startSlash).fill('slash'), ...Array(BALANCE.startGuard).fill('guard'), ...ch.startCards];
  return ids.map((id) => ({ uid: run.nextUid++, id, up: null }));
}

export function newCard(run: RunState, id: string): CardInst {
  return { uid: run.nextUid++, id, up: null };
}

/** 같은 시드에서 같은 순서가 나오는 셔플 (deck 스트림) */
export function shuffle(ctx: Ctx, cards: CardInst[]): CardInst[] {
  const r = rng(ctx, 'deck');
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function handMax(run: RunState): number {
  return BALANCE.handMax + getMods(run).handMax;
}

/** 카드 n장 뽑기. 뽑을 더미가 비면 버린 더미를 섞어 새로 만든다. 손패가 가득 차면 바로 버린다 */
export function drawCards(ctx: Ctx, n: number): CardInst[] {
  const cb = cbOf(ctx);
  const got: CardInst[] = [];
  let overflow = 0;
  for (let i = 0; i < n; i++) {
    if (!cb.drawPile.length) {
      if (!cb.discard.length) break;
      cb.drawPile = shuffle(ctx, cb.discard);
      cb.discard = [];
    }
    const c = cb.drawPile.shift()!;
    if (cb.cards.length >= handMax(ctx.run)) { cb.discard.push(c); overflow++; continue; }
    cb.cards.push(c);
    got.push(c);
  }
  if (overflow) toast(ctx, '손패가 가득 찼다', 'bad');
  if (got.length) {
    ctx.emit({ t: 'draw', n: got.length });
    fire(ctx, 'onDraw', { amount: got.length });
  }
  return got;
}

/** 손패 → 버린 더미 (임시 카드는 사라진다) */
export function discardHand(cb: CombatState) {
  cb.discard.push(...cb.cards.filter((c) => !c.temp));
  cb.cards = [];
}

/** 카드를 손패에서 빼서 버린 더미 / 소멸 더미로 */
export function moveAfterUse(cb: CombatState, inst: CardInst, exhaust: boolean) {
  const i = cb.cards.indexOf(inst);
  if (i >= 0) cb.cards.splice(i, 1);
  if (inst.temp) return;
  if (exhaust) cb.exhausted.push(inst);
  else cb.discard.push(inst);
}

/** 턴당 1회: 쓰지 않은 주사위 하나를 태워 카드 뽑기 (그 주사위는 저금통에 들어가지 않는다) */
export function canBurn(ctx: Ctx): boolean {
  const cb = ctx.run.combat;
  return !!cb && cb.phase !== 'over' && !cb.turnCounters.burned && cb.hand.some((h) => !h.used);
}

export function burnDie(ctx: Ctx, key: number): boolean {
  const cb = cbOf(ctx);
  if (!canBurn(ctx)) return false;
  const hd = cb.hand.find((h) => h.key === key && !h.used);
  if (!hd) return false;
  hd.used = true;
  hd.gone = true;
  cb.turnCounters.burned = 1;
  drawCards(ctx, 1 + getMods(ctx.run).burnDraw);
  return true;
}

/** 덱의 카드 수 (태그 계산 등에서 쓰는 "덱"은 run.deck) */
export function deckCount(run: RunState, pred: (id: string) => boolean): number {
  return run.deck.filter((c) => pred(c.id)).length;
}

export { CARD_BY_ID, resolveCard };
