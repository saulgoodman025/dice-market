import { describe, expect, it } from 'vitest';
import { newRun, finishCombat, pickCardReward, collectRewardGold } from '../src/rules/run';
import { confirmHand, endTurn, playCard, startCombat } from '../src/rules/combat';
import { drawCards, burnDie, handMax } from '../src/rules/deck';
import { CARDS, CARD_BY_ID, resolveCard } from '../src/data/cards';
import { BALANCE } from '../src/data/balance';
import type { Ctx } from '../src/rules/ctx';

const mk = (seed = 1, char = 'gambler') => {
  const run = newRun(seed, char);
  const ctx: Ctx = { run, emit: () => {} };
  return { run, ctx };
};

describe('덱 코어', () => {
  it('시작 덱 10장: 베기 4 · 방패 4 · 캐릭터 시작 카드 2', () => {
    for (const ch of ['gambler', 'merchant', 'knight', 'sharp']) {
      const { run } = mk(1, ch);
      expect(run.deck.length).toBe(10);
      expect(run.deck.filter((c) => c.id === 'slash').length).toBe(4);
      expect(run.deck.filter((c) => c.id === 'guard').length).toBe(4);
      expect(run.deck.filter((c) => CARD_BY_ID[c.id].starter && CARD_BY_ID[c.id].owner === ch).length).toBe(2);
    }
  });

  it('같은 시드에서 셔플·드로우 순서가 같다', () => {
    const a = mk(77);
    const b = mk(77);
    startCombat(a.ctx, 'normal', ['golem']);
    startCombat(b.ctx, 'normal', ['golem']);
    expect(a.run.combat!.cards.map((c) => c.uid)).toEqual(b.run.combat!.cards.map((c) => c.uid));
    expect(a.run.combat!.drawPile.map((c) => c.uid)).toEqual(b.run.combat!.drawPile.map((c) => c.uid));
  });

  it('매 턴 5장 뽑고, 턴이 끝나면 손패를 모두 버린다', () => {
    const { run, ctx } = mk(3, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.enemies[0].hp = cb.enemies[0].maxHp = 9999;
    expect(cb.cards.length).toBe(BALANCE.drawPerTurn);
    expect(cb.drawPile.length).toBe(5);
    endTurn(ctx);
    expect(cb.cards.length).toBe(BALANCE.drawPerTurn + (cb.turnCounters.handDraw ? 1 : 0));
  });

  it('뽑을 더미가 비면 버린 더미를 섞어 다시 뽑는다', () => {
    const { run, ctx } = mk(4, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.enemies[0].hp = cb.enemies[0].maxHp = 9999;
    endTurn(ctx); // 5장 버림 → 나머지 5장 뽑음
    endTurn(ctx); // 뽑을 더미 0 → 버린 더미 재셔플
    expect(cb.cards.length).toBeGreaterThanOrEqual(5);
    expect(cb.drawPile.length + cb.discard.length + cb.cards.length).toBe(10);
  });

  it('손패 상한을 넘는 드로우는 바로 버린 더미로', () => {
    const { run, ctx } = mk(5, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    for (let i = 0; i < 20; i++) cb.drawPile.push({ uid: 9000 + i, id: 'slash', up: null });
    drawCards(ctx, 15);
    expect(cb.cards.length).toBe(handMax(run));
    expect(cb.discard.length).toBeGreaterThan(0);
  });

  it('소멸 카드는 이번 전투에서만 사라지고 다음 전투에 돌아온다', () => {
    const { run, ctx } = mk(6, 'knight');
    run.deck.push({ uid: run.nextUid++, id: 'firstaid', up: null });
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.cards.push(cb.drawPile.splice(cb.drawPile.findIndex((c) => c.id === 'firstaid'), 1)[0]);
    confirmHand(ctx);
    cb.handChips = 5;
    const i = cb.cards.findIndex((c) => c.id === 'firstaid');
    expect(playCard(ctx, i, [cb.hand[0].key])).toBe(true);
    expect(cb.exhausted.some((c) => c.id === 'firstaid')).toBe(true);
    // 다음 전투
    cb.enemies.forEach((e) => { e.hp = 0; });
    cb.result = 'win';
    finishCombat(ctx);
    collectRewardGold(ctx);
    pickCardReward(ctx, null);
    run.reward = null;
    startCombat(ctx, 'normal', ['golem']);
    const all = [...run.combat!.cards, ...run.combat!.drawPile];
    expect(all.some((c) => c.id === 'firstaid')).toBe(true);
    expect(run.deck.length).toBe(11);
  });

  it('주사위 태우기: 턴당 1번, 카드 1장, 저금통에 안 들어감', () => {
    const { run, ctx } = mk(7, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    const n0 = cb.cards.length;
    const d = cb.hand[0];
    expect(burnDie(ctx, d.key)).toBe(true);
    expect(cb.cards.length).toBe(n0 + 1);
    expect(burnDie(ctx, cb.hand[1].key)).toBe(false);
    const sum = cb.hand.filter((h) => !h.used).reduce((s, h) => s + h.pip, 0);
    cb.enemies[0].hp = cb.enemies[0].maxHp = 9999;
    endTurn(ctx);
    expect(cb.piggy).toBe(sum);
  });

  it('족보 드로우: 투 페어 이상이면 1장 더', () => {
    const { run, ctx } = mk(8, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.hand.forEach((h, i) => { h.pip = [2, 2, 5, 5, 1][i]; h.sticker = undefined; h.material = 'wood'; });
    const n0 = cb.cards.length;
    confirmHand(ctx);
    expect(cb.handResult!.id).toBe('twopair');
    expect(cb.cards.length).toBe(n0 + 1);
  });

  it('카드 보상: 3장 중복 없음, 보스 보상에 일반 등급 없음', () => {
    for (let s = 1; s <= 40; s++) {
      const { run, ctx } = mk(100 + s);
      startCombat(ctx, 'boss', ['pitboss']);
      run.combat!.result = 'win';
      run.combat!.enemies.forEach((e) => { e.hp = 0; });
      finishCombat(ctx);
      const cards = run.reward!.cards;
      expect(new Set(cards).size).toBe(cards.length);
      expect(cards.every((id) => CARD_BY_ID[id].rarity !== 'common')).toBe(true);
    }
  });
});

describe('카드 데이터', () => {
  it('모든 풀 카드는 강화 A/B가 있다 (강화 불가 카드 0장)', () => {
    for (const c of CARDS.filter((x) => x.rarity !== 'curse')) {
      expect(c.upgrades, c.id).toBeTruthy();
      const a = resolveCard({ id: c.id, up: 'A' });
      const b = resolveCard({ id: c.id, up: 'B' });
      expect(a.desc + a.cost + JSON.stringify(a.n) + JSON.stringify(a.cond), c.id).not.toBe(c.desc + c.cost + JSON.stringify(c.v) + JSON.stringify(c.cond));
      expect(b.desc + b.cost + JSON.stringify(b.n) + JSON.stringify(b.cond) + b.exhaust, c.id).not.toBe(c.desc + c.cost + JSON.stringify(c.v) + JSON.stringify(c.cond) + c.exhaust);
    }
  });

  it('카드 120장 모두 실제로 쓸 수 있다 (오류 없이 실행)', () => {
    for (const c of CARDS.filter((x) => x.rarity !== 'curse')) {
      for (const up of [null, 'A', 'B'] as const) {
        const { run, ctx } = mk(9, c.owner === 'common' ? 'gambler' : c.owner);
        run.gold = 200;
        startCombat(ctx, 'normal', ['golem', 'golem']);
        const cb = run.combat!;
        cb.enemies.forEach((e) => { e.hp = e.maxHp = 9999; });
        cb.hand.forEach((h, i) => { h.pip = [6, 6, 6, 5, 5][i]; h.sticker = undefined; h.material = 'wood'; });
        cb.lastCard = { uid: 1, id: 'slash', up: null };
        cb.handChips = 9;
        cb.cards.push({ uid: run.nextUid++, id: c.id, up });
        const idx = cb.cards.length - 1;
        const rc = resolveCard({ id: c.id, up });
        // 조건에 맞는 주사위를 직접 고른다
        const cond = rc.cond;
        let pips: number[] = [];
        switch (cond.k) {
          case 'instant': pips = []; break;
          case 'range': pips = [cond.hi]; break;
          case 'even': pips = [6]; break;
          case 'odd': pips = [5]; break;
          case 'exact': pips = [cond.v]; break;
          case 'exactN': pips = Array(cond.n).fill(cond.v); break;
          case 'same': case 'sameMin': pips = Array(cond.n).fill(4); break;
          case 'seq': pips = Array.from({ length: cond.n }, (_, i) => 1 + i); break;
          case 'sumPair': pips = [3, 4]; break;
          case 'sumSet': pips = [3, 4]; break;
          case 'sumMin': pips = [6, 6, 6]; break;
          case 'dice': pips = [6, 6, 6, 3]; break;
          case 'full': case 'tripPlus2': pips = [3, 3, 3, 2, 2]; break;
          case 'anyN': pips = Array(cond.n).fill(3); break;
          case 'all': pips = [6, 6, 6, 5, 5]; break;
          default: pips = [4];
        }
        if (rc.needHand) { cb.handBoost = 9; }
        if (rc.rollOnly) cb.phase = 'roll'; else confirmHand(ctx);
        cb.handChips = 9;
        const free = cb.hand.filter((h) => !h.used);
        pips.forEach((p, i) => { if (free[i]) { free[i].pip = p; free[i].sticker = undefined; free[i].material = 'wood'; } });
        const keys = free.slice(0, pips.length).map((h) => h.key);
        const choice = { key: free[pips.length]?.key, value: 5, cardUid: cb.drawPile[0]?.uid };
        expect(playCard(ctx, idx, keys, choice), `${c.id}${up ?? ''}`).toBe(true);
      }
    }
  });
});
