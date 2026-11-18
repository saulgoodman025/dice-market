import { describe, expect, it } from 'vitest';
import { newRun, openShop, shopReroll } from '../src/rules/run';
import { confirmHand, endTurn, playCard, reroll, startCombat, toggleLock } from '../src/rules/combat';
import type { Ctx } from '../src/rules/ctx';
import { donChance, donEV, rouletteOdds, slotOdds, haggleOdds } from '../src/rules/casino';
import { MANIP_SKILLS } from '../src/data/meta';
import { CARDS } from '../src/data/cards';
import { RELICS } from '../src/data/relics';
import { FACES } from '../src/data/faces';
import { MATERIALS } from '../src/data/materials';
import { CONSUMABLES } from '../src/data/consumables';
import { ENEMIES } from '../src/data/enemies';
import { EVENTS } from '../src/data/events';
import { HANDS } from '../src/data/hands';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 손패에 카드를 넣고 바로 쓴다 */
const play = (ctx: Ctx, id: string, keys: number[]) => {
  const cb = ctx.run.combat!;
  cb.cards.push({ uid: ctx.run.nextUid++, id, up: null });
  return playCard(ctx, cb.cards.length - 1, keys);
};

const mk = (seed = 1, char = 'gambler') => {
  const run = newRun(seed, char);
  return { run, ctx: { run, emit: () => {} } };
};

describe('콘텐츠 수량', () => {
  it('사양서 수량과 일치', () => {
    expect(CARDS.filter((c) => c.rarity !== 'basic' && c.rarity !== 'curse' && c.owner === 'common').length).toBe(60);
    expect(CARDS.filter((c) => c.owner !== 'common').length).toBe(60);
    expect(FACES.length).toBe(20);
    expect(MATERIALS.length).toBe(9);
    expect(RELICS.length).toBe(50);
    expect(CONSUMABLES.length).toBe(16);
    expect(EVENTS.length).toBe(15);
    expect(HANDS.length).toBe(10);
    expect(ENEMIES.filter((e) => e.tier === 'boss').length).toBe(3);
    for (const act of [1, 2, 3]) {
      expect(ENEMIES.filter((e) => e.act === act && e.tier === 'normal').length).toBeGreaterThanOrEqual(6);
      expect(ENEMIES.filter((e) => e.act === act && e.tier === 'elite').length).toBe(2);
    }
  });
});

describe('전투 코어', () => {
  it('잠근 주사위는 리롤되지 않는다', () => {
    const { run, ctx } = mk(3);
    startCombat(ctx, 'normal', ['bouncer']);
    const cb = run.combat!;
    const keep = cb.hand[0];
    toggleLock(ctx, keep.key);
    const before = keep.pip;
    for (let i = 0; i < 2; i++) reroll(ctx);
    expect(keep.pip).toBe(before);
    expect(cb.rerollsLeft).toBe(0);
  });

  it('베기: 피해 = 눈 × 족보 배율 (나무 주사위)', () => {
    const { run, ctx } = mk(5, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    const e = cb.enemies[0];
    const d = cb.hand.find((h) => h.material === 'wood')!;
    confirmHand(ctx);
    const mult = cb.handResult!.mult;
    const hp = e.hp;
    play(ctx, 'slash', [d.key]);
    expect(hp - e.hp).toBe(Math.round(d.pip * mult));
  });

  it('쓰지 않은 주사위는 저금통으로', () => {
    const { run, ctx } = mk(9, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    const sum = cb.hand.reduce((s, h) => s + h.pip, 0);
    endTurn(ctx);
    expect(cb.piggy).toBe(sum);
  });

  it('노 핸드는 열기를 0으로', () => {
    const { run, ctx } = mk(11);
    run.heat = 4;
    startCombat(ctx, 'normal', ['bouncer']);
    const cb = run.combat!;
    cb.hand.forEach((h, i) => { h.pip = [1, 2, 4, 5, 6][i] ?? 1; h.sticker = undefined; h.material = 'wood'; });
    confirmHand(ctx);
    expect(cb.handResult!.id).toBe('none');
    expect(run.heat).toBe(0);
  });
});

describe('카지노 기대값 (R2/R4)', () => {
  it('기본 EV ≤ 1.0 (도박사 고유 능력 제외)', () => {
    const { run } = mk(1, 'knight');
    expect(donEV(run)).toBeLessThanOrEqual(1.0);
    expect(donChance(run)).toBeCloseTo(0.5);
    expect(slotOdds(run).ev).toBeLessThanOrEqual(1.0);
    for (const r of rouletteOdds(run).rows) expect(r.ev).toBeLessThanOrEqual(1.0);
    expect(haggleOdds(run).ev).toBeCloseTo(0.8);
  });
  it('빌드로 EV > 1.0 가능 (하우스의 열쇠)', () => {
    const { run } = mk(1, 'knight');
    run.relics.push('housekey');
    expect(donEV(run)).toBeGreaterThan(1.0);
  });
});

describe('가드레일 (§5)', () => {
  it('1막 상점에 눈 조작 카드 등장 확률 ≥ 60%', () => {
    let hit = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const { run, ctx } = mk(1000 + i);
      openShop(ctx);
      if (run.shop!.items.some((it) => it.opt.kind === 'card' && MANIP_SKILLS.includes(it.opt.id))) hit++;
    }
    expect(hit / N).toBeGreaterThanOrEqual(0.6);
  });

  it('규칙 코드에 Math.random 사용 금지', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)) : [join(d, f.name)]));
    for (const f of walk('src').filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(f, 'utf8').includes('Math.random'), f).toBe(false);
    }
  });

  it('규칙 코드에서 특정 아이템 id를 if로 검사하지 않는다', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)) : [join(d, f.name)]));
    for (const f of walk('src/rules')) {
      const src = readFileSync(f, 'utf8');
      expect(/def\.id\s*===|\.id\s*===\s*'(?:[a-z]+)'/.test(src), f).toBe(false);
    }
  });
});

describe('막 전체 지도 (갈림길)', () => {
  it('막다른 길 없음 · 모든 노드 도달 가능 · 보스 직전 안전 노드 · 카지노만 있는 길 없음', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { run } = mk(seed);
      const m = run.map;
      expect(m.length).toBe(5);
      expect(m[4].map((n) => n.type)).toEqual(['boss']);
      for (let f = 0; f < 4; f++) {
        for (const n of m[f]) {
          expect(n.next.length).toBeGreaterThan(0);
          expect(n.next.some((j) => m[f + 1][j].type !== 'casino')).toBe(true);
        }
        for (let j = 0; j < m[f + 1].length; j++) expect(m[f].some((n) => n.next.includes(j))).toBe(true);
      }
      for (const n of m[2]) expect(n.next.some((j) => ['shop', 'rest'].includes(m[3][j].type))).toBe(true);
    }
  });
});

describe('족보 칩 · 잠금 제한 · 약점 눈', () => {
  it('한 번에 2개까지만 잠근다 (사기꾼은 3개)', () => {
    const { run, ctx } = mk(21, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.hand.forEach((h) => { h.material = 'wood'; });
    cb.hand.slice(0, 4).forEach((h) => toggleLock(ctx, h.key));
    expect(cb.hand.filter((h) => h.locked).length).toBe(2);
    const s = mk(21, 'sharp');
    startCombat(s.ctx, 'normal', ['golem']);
    s.run.combat!.hand.forEach((h) => { h.material = 'wood'; });
    s.run.combat!.hand.slice(0, 4).forEach((h) => toggleLock(s.ctx, h.key));
    expect(s.run.combat!.hand.filter((h) => h.locked).length).toBe(3);
  });

  it('칩이 부족하면 카드를 못 쓰고, 쓰면 비용만큼 줄어든다', () => {
    const { run, ctx } = mk(22, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.hand.forEach((h, i) => { h.pip = [1, 2, 4, 5, 6][i]; h.sticker = undefined; h.material = 'wood'; });
    confirmHand(ctx); // 노 핸드 → 칩 2
    expect(cb.handChips).toBe(2);
    expect(play(ctx, 'slash', [cb.hand[0].key])).toBe(true); // 베기 (1)
    expect(cb.handChips).toBe(1);
    cb.handChips = 0;
    expect(play(ctx, 'guard', [cb.hand[1].key])).toBe(false); // 방패 (1) 불가
  });

  it('남은 칩은 3개까지만 다음 턴으로 넘어간다', () => {
    const { run, ctx } = mk(23, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.enemies[0].hp = 9999;
    confirmHand(ctx);
    cb.handChips = 7;
    endTurn(ctx);
    expect(cb.handChips).toBeLessThanOrEqual(3);
  });

  it('약점 눈으로 공격하면 피해 1.75배', () => {
    const { run, ctx } = mk(24, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    const e = cb.enemies[0];
    e.hp = e.maxHp = 999; e.block = 0;
    cb.hand.forEach((h, i) => { h.pip = [2, 3, 4, 5, 6][i]; h.sticker = undefined; h.material = 'wood'; });
    confirmHand(ctx);
    const mult = cb.handResult!.mult;
    run.heat = 0; // 열기 보너스 제외
    e.weakPip = 4;
    const hp0 = e.hp;
    play(ctx, 'slash', [cb.hand[2].key]); // 베기 4
    expect(hp0 - e.hp).toBe(Math.round(Math.round(4 * mult) * 1.75));
  });
});

describe('상점 리롤 제한', () => {
  it('상점당 리롤은 1번만', () => {
    const { run, ctx } = mk(31);
    run.gold = 999;
    openShop(ctx);
    expect(shopReroll(ctx)).not.toBeNull();
    expect(shopReroll(ctx)).toBeNull();
    expect(run.shop!.rerolls).toBe(1);
  });
});

describe('족보 재판정', () => {
  it('올리기로 눈을 바꾸면 족보도 바뀐다 (트리플 → 포카드)', () => {
    const { run, ctx } = mk(41, 'sharp');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    cb.enemies[0].hp = 9999;
    cb.hand.forEach((h, i) => { h.pip = [6, 6, 6, 5, 2][i]; h.sticker = undefined; h.material = 'wood'; });
    confirmHand(ctx);
    expect(cb.handResult!.id).toBe('triple');
    const chips0 = cb.handChips;
    expect(play(ctx, 'bump', [cb.hand[3].key])).toBe(true); // 5 → 6
    expect(cb.hand.filter((h) => !h.gone).map((h) => h.pip).filter((p) => p === 6).length).toBe(4);
    expect(cb.handResult!.id).toBe('four');
    expect(cb.handChips).toBe(chips0 + 3); // 트리플 4 → 포카드 7 (올리기 비용 0)
  });
});

describe('버프·디버프', () => {
  const setup = (seed: number) => {
    const { run, ctx } = mk(seed, 'knight');
    startCombat(ctx, 'normal', ['golem']);
    const cb = run.combat!;
    const e = cb.enemies[0];
    e.hp = e.maxHp = 999; e.block = 0; e.weakPip = 99;
    run.heat = 0;
    cb.hand.forEach((h, i) => { h.pip = [1, 2, 4, 5, 6][i]; h.sticker = undefined; h.material = 'wood'; });
    confirmHand(ctx); // 노 핸드 ×1
    cb.handChips = 9;
    return { run, ctx, cb, e };
  };
  it('힘: 공격 피해 +N', () => {
    const { ctx, cb, e } = setup(51);
    cb.pStr = 3;
    play(ctx, 'slash', [cb.hand[2].key]); // 베기 4
    expect(999 - e.hp).toBe(7);
  });
  it('약화: 내 피해 ×0.75, 취약한 적: 받는 피해 ×1.5', () => {
    const a = setup(52);
    a.cb.pWeak = 1;
    play(a.ctx, 'slash', [a.cb.hand[2].key]);
    expect(999 - a.e.hp).toBe(3);
    const b = setup(53);
    b.e.vuln = 1;
    play(b.ctx, 'slash', [b.cb.hand[2].key]);
    expect(999 - b.e.hp).toBe(6);
  });
  it('상태는 턴이 지나면 줄어든다', () => {
    const { ctx, cb, e } = setup(54);
    cb.pWeak = 1; e.vuln = 1;
    endTurn(ctx);
    expect(cb.pWeak).toBe(0);
    expect(e.vuln).toBe(0);
  });
});
