import { describe, expect, it } from 'vitest';
import { newRun, advance, removeCards, restRemove, openShop, shopRemoveService, removePrice, continueEndless } from '../src/rules/run';
import { confirmHand, endTurn, playCard, previewCard, startCombat } from '../src/rules/combat';
import { addBuff, buffFx, playerStr } from '../src/rules/buffs';
import { activeCombos, augmentOdds, offerAugment, pickAugment, prismRoulette, rerollAugment, shredder, shredderOdds, snapshotTiers, tagCounts, tierOf } from '../src/rules/sets';
import { getMods, type Ctx } from '../src/rules/ctx';
import { BALANCE } from '../src/data/balance';
import { AUGMENTS } from '../src/data/augments';
import { COMBOS } from '../src/data/sets';
import { CARDS } from '../src/data/cards';
import { RELICS } from '../src/data/relics';
import { finishCombat, collectRewardGold, pickCardReward, leaveReward } from '../src/rules/run';

const mk = (seed = 1, char = 'knight') => {
  const run = newRun(seed, char);
  const ctx: Ctx = { run, emit: () => {} };
  return { run, ctx };
};

const combat = (seed = 1) => {
  const { run, ctx } = mk(seed);
  startCombat(ctx, 'normal', ['golem']);
  const cb = run.combat!;
  const e = cb.enemies[0];
  e.hp = e.maxHp = 999; e.block = 0; e.weakPip = 99;
  run.heat = 0;
  cb.hand.forEach((h, i) => { h.pip = [1, 2, 4, 5, 6][i]; h.sticker = undefined; h.material = 'wood'; });
  confirmHand(ctx);
  cb.handChips = 9;
  return { run, ctx, cb, e };
};

const play = (ctx: Ctx, id: string, keys: number[]) => {
  const cb = ctx.run.combat!;
  cb.cards.push({ uid: ctx.run.nextUid++, id, up: null });
  return playCard(ctx, cb.cards.length - 1, keys);
};

describe('지속 버프 (buffs)', () => {
  it('지속 턴이 줄고 0이 되면 사라진다 (결의: 2턴간 힘 +1)', () => {
    const { ctx, cb } = combat(1);
    play(ctx, 'resolve', []);
    expect(playerStr(cb)).toBe(1);
    endTurn(ctx);
    expect(playerStr(cb)).toBe(1);
    endTurn(ctx);
    expect(playerStr(cb)).toBe(0);
  });

  it('같은 버프가 다시 걸리면 턴은 큰 쪽, 값은 합산', () => {
    const { cb } = combat(2);
    addBuff(cb, { id: 'str', owner: 'player', turns: 2, value: 1, src: 't' });
    addBuff(cb, { id: 'str', owner: 'player', turns: 4, value: 2, src: 't' });
    expect(cb.buffs.length).toBe(1);
    expect(cb.buffs[0].turns).toBe(4);
    expect(buffFx(cb).str).toBe(3);
  });

  it('[1턴] 방어 버프는 적의 공격을 받는 동안 유지된다 (이지스)', () => {
    const { run, ctx, cb } = combat(3);
    cb.enemies[0].intent = { k: 'attack', n: 20, label: '20', icon: '⚔️' };
    cb.block = 0;
    addBuff(cb, { id: 'aegis', owner: 'player', turns: 1, value: 1, src: 't' });
    const hp = run.hp;
    endTurn(ctx);
    expect(run.hp).toBe(hp);
    expect(cb.buffs.some((b) => b.id === 'aegis')).toBe(false);
  });

  it('"매 턴 시작" 버프는 정확히 N번 발동 (채권 3턴)', () => {
    const { ctx, cb } = combat(4);
    play(ctx, 'bond', []);
    const p0 = cb.piggy;
    endTurn(ctx); endTurn(ctx); endTurn(ctx); endTurn(ctx);
    // 매 턴 남은 주사위도 저금통에 들어가므로, 채권 몫만 확인
    expect(cb.buffs.some((b) => b.id === 'bond')).toBe(false);
    expect(cb.piggy).toBeGreaterThan(p0 + 15 - 1);
  });

  it('회귀: 약화·취약 동작은 그대로 (내 약화 ×0.75, 적 취약 ×1.5)', () => {
    const a = combat(5);
    a.cb.pWeak = 1;
    play(a.ctx, 'slash', [a.cb.hand[2].key]);
    expect(999 - a.e.hp).toBe(3);
    const b = combat(6);
    b.e.vuln = 1;
    play(b.ctx, 'slash', [b.cb.hand[2].key]);
    expect(999 - b.e.hp).toBe(6);
  });
});

describe('카드 삭제 4경로', () => {
  it('상점 서비스: 50 → 75 → 100G, 상점당 1번', () => {
    const { run, ctx } = mk(11);
    run.gold = 999;
    openShop(ctx);
    expect(removePrice(run)).toBe(50);
    expect(shopRemoveService(ctx)).toBe(true);
    removeCards(ctx, [run.deck[0].uid]);
    expect(run.deck.length).toBe(9);
    expect(run.gold).toBe(949);
    expect(shopRemoveService(ctx)).toBe(false);
    openShop(ctx);
    expect(removePrice(run)).toBe(75);
  });

  it('휴게실 제거', () => {
    const { run, ctx } = mk(12);
    run.screen = 'rest';
    restRemove(ctx);
    removeCards(ctx, [run.deck[0].uid]);
    expect(run.deck.length).toBe(9);
  });

  it('덱이 5장 미만이 되는 삭제는 불가', () => {
    const { run, ctx } = mk(13);
    run.deck = run.deck.slice(0, 5);
    run.screen = 'rest';
    restRemove(ctx);
    removeCards(ctx, [run.deck[0].uid]);
    expect(run.deck.length).toBe(5);
  });

  it('파쇄기 룰렛: 표시 확률 50%와 실제 분포 일치 (10,000회 ±2%)', () => {
    let win = 0;
    const N = 10000;
    const { run, ctx } = mk(14);
    for (let i = 0; i < N; i++) {
      run.flags.shredder = 0;
      run.chips = 5;
      run.deck = Array.from({ length: 12 }, (_, k) => ({ uid: 100000 + k, id: 'slash', up: null }));
      const r = shredder(ctx, run.deck[0].uid)!;
      if (r.win) win++;
    }
    expect(Math.abs(win / N - shredderOdds(run))).toBeLessThan(0.02);
  });

  it('파쇄기: 실패하면 저주 카드가 들어오고, 판당 3번까지', () => {
    const { run, ctx } = mk(15);
    run.chips = 10;
    let curses = 0;
    for (let i = 0; i < 5; i++) {
      const r = shredder(ctx, run.deck[0].uid);
      if (i >= 3) expect(r).toBeNull();
      else if (!r!.win) curses++;
    }
    expect(run.deck.filter((c) => ['debtnote', 'badluck', 'withdrawal'].includes(c.id)).length).toBe(curses);
  });
});

describe('태그 단계 · 숨은 콤보', () => {
  it('단계는 전투 시작 시 계산 (증강 +1 포함)', () => {
    const { run, ctx } = mk(21);
    run.deck.push(...['jab', 'heavy'].map((id) => ({ uid: run.nextUid++, id, up: null as null })));
    expect(tagCounts(run).blade).toBe(3); // 결의(⚔) + 잽 + 강타
    run.augments.push('whetstone'); // ⚔ +1
    run.deck.push({ uid: run.nextUid++, id: 'twin', up: null });
    expect(tagCounts(run).blade).toBe(5);
    expect(tierOf(5)).toBe(2);
    startCombat(ctx, 'normal', ['golem']);
    expect(run.flags.tier_blade).toBe(2);
    expect(getMods(run).firstAtkDraw).toBe(1);
    expect(run.combat!.pStr).toBe(1); // 1단계: 전투 시작 힘 +1 (2단계는 드로우)
    // 전투 중 덱이 바뀌어도 이번 전투 단계는 그대로
    run.deck.push({ uid: run.nextUid++, id: 'triple', up: null }, { uid: run.nextUid++, id: 'rally', up: null });
    expect(run.flags.tier_blade).toBe(2);
    snapshotTiers(run);
    expect(run.flags.tier_blade).toBe(3);
  });

  it('콤보는 두 카드가 덱에 있으면 켜지고, 하나가 삭제되면 해제', () => {
    const { run, ctx } = mk(22);
    const events: string[] = [];
    ctx.emit = (e) => { if (e.t === 'combo') events.push(e.id); };
    run.screen = 'rest';
    run.deck.push({ uid: run.nextUid++, id: 'twin', up: null }, { uid: run.nextUid++, id: 'triple', up: null });
    // addCard 경로를 쓰지 않았으니 직접 동기화
    restRemove(ctx);
    expect(activeCombos(run).map((c) => c.id)).toContain('bladestorm');
    removeCards(ctx, [run.deck.find((c) => c.id === 'slash')!.uid]);
    expect(events).toContain('bladestorm');
    expect(run.flags.combo_bladestorm).toBe(1);
    run.screen = 'rest';
    restRemove(ctx);
    removeCards(ctx, [run.deck.find((c) => c.id === 'triple')!.uid]);
    expect(run.flags.combo_bladestorm).toBe(0);
    expect(activeCombos(run).length).toBe(0);
  });

  it('콤보 20종 · 모든 짝 카드가 실제로 존재', () => {
    expect(COMBOS.length).toBe(20);
    const ids = new Set(CARDS.map((c) => c.id));
    for (const c of COMBOS) { expect(ids.has(c.a), c.a).toBe(true); expect(ids.has(c.b), c.b).toBe(true); }
  });
});

describe('증강', () => {
  it('56종 · 실버 24 / 골드 20 / 프리즘 12 · id가 유물·카드와 겹치지 않음', () => {
    expect(AUGMENTS.length).toBe(56);
    expect(AUGMENTS.filter((a) => a.tier === 'silver').length).toBe(24);
    expect(AUGMENTS.filter((a) => a.tier === 'gold').length).toBe(20);
    expect(AUGMENTS.filter((a) => a.tier === 'prism').length).toBe(12);
    const others = new Set([...RELICS.map((r) => r.id), ...CARDS.map((c) => c.id)]);
    for (const a of AUGMENTS) expect(others.has(a.id), a.id).toBe(false);
  });

  it('막마다 1번(2층을 마친 뒤) = 판당 3번, 엔드리스 진입 시 1번 더', () => {
    const { run, ctx } = mk(31);
    let offers = 0;
    for (let act = 1; act <= 3; act++) {
      for (let f = 0; f < 5; f++) {
        run.screen = 'map';
        advance(ctx);
        if (run.augmentOffer) { offers++; pickAugment(ctx, 0); }
        if ((run.screen as string) === 'victory') break;
      }
    }
    expect(run.screen).toBe('victory');
    expect(offers).toBe(3);
    continueEndless(ctx);
    expect(run.augmentOffer).not.toBeNull();
  });

  it('표시 확률과 실제 등급 분포 일치, DDA(flow)가 바꾸지 않음', () => {
    for (const flow of [5, 95]) {
      const cnt = { silver: 0, gold: 0, prism: 0 };
      const N = 6000;
      const { run, ctx } = mk(32);
      run.dda.flow = flow;
      for (let i = 0; i < N; i++) {
        run.augments = [];
        run.flags.prismSeen = 1;
        offerAugment(ctx, 'map');
        cnt[run.augmentOffer!.tier]++;
      }
      const w = augmentOdds(run).w;
      expect(Math.abs(cnt.silver / N - w[0] / 100)).toBeLessThan(0.02);
      expect(Math.abs(cnt.gold / N - w[1] / 100)).toBeLessThan(0.02);
      expect(Math.abs(cnt.prism / N - w[2] / 100)).toBeLessThan(0.02);
    }
  });

  it('프리즘 천장: 3막까지 프리즘을 못 봤으면 확정', () => {
    const { run, ctx } = mk(33);
    run.act = 3;
    run.flags.prismSeen = 0;
    offerAugment(ctx, 'map');
    expect(run.augmentOffer!.tier).toBe('prism');
  });

  it('리롤은 왼쪽·가운데·오른쪽 자리마다 1번, 등급 유지 · 프리즘 룰렛은 골드에서만', () => {
    const { run, ctx } = mk(34);
    offerAugment(ctx, 'map');
    const tier = run.augmentOffer!.tier;
    expect(rerollAugment(ctx, 0)).toBe(true);
    expect(rerollAugment(ctx, 0)).toBe(false); // 같은 자리 두 번은 불가
    expect(rerollAugment(ctx, 1)).toBe(true);
    expect(rerollAugment(ctx, 2)).toBe(true);
    expect(rerollAugment(ctx, 2)).toBe(false);
    // 다음 증강에서는 다시 자리마다 1번
    pickAugment(ctx, 0);
    offerAugment(ctx, 'map');
    expect(rerollAugment(ctx, 0)).toBe(true);
    expect(run.augmentOffer!.tier).toBe(tier);
    run.augmentOffer!.tier = 'silver';
    run.chips = 9;
    expect(prismRoulette(ctx)).toBeNull();
    run.augmentOffer!.tier = 'gold';
    expect(prismRoulette(ctx)).not.toBeNull();
    expect(run.chips).toBe(6);
    expect(['prism', 'silver']).toContain(run.augmentOffer!.tier);
  });

  it('보상 화면 흐름: 카드 단계 후 다음으로', () => {
    const { run, ctx } = mk(35);
    startCombat(ctx, 'normal', ['golem']);
    run.combat!.result = 'win';
    run.combat!.enemies.forEach((e) => { e.hp = 0; });
    finishCombat(ctx);
    collectRewardGold(ctx);
    const g = run.gold;
    pickCardReward(ctx, null);
    expect(run.gold).toBe(g + BALANCE.cardSkipGold);
    leaveReward(ctx);
    expect(run.screen).toBe('map');
  });
});

describe('증강 리롤 중복', () => {
  it('한 번 뜬 증강은 리롤로 다시 나오지 않는다', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { run, ctx } = mk(seed, 'gambler');
      offerAugment(ctx, 'map');
      const of = run.augmentOffer!;
      const shown = [...of.ids];
      for (let i = 0; i < of.ids.length; i++) {
        rerollAugment(ctx, i);
        if (of.rerolled[i]) { expect(shown).not.toContain(of.ids[i]); shown.push(of.ids[i]); }
      }
    }
  });
});

describe('방패 3단계 미리보기', () => {
  it('방어 카드는 반격 피해가 있어도 방어도 수치로 표시된다', () => {
    const { run, ctx, cb } = combat(3);
    run.flags.tier_shield = 3;
    cb.cards.push({ uid: 9001, id: 'guard', up: null });
    const pv = previewCard(ctx, cb.cards.length - 1, []);
    expect(pv.block).toBeGreaterThan(0);
    expect(pv.blockDmg).toBeGreaterThan(0);
    expect(pv.dmg + pv.blocked).toBeLessThanOrEqual(pv.blockDmg);
  });
});

