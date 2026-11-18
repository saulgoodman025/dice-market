import { describe, expect, it } from 'vitest';
import { newRun, continueEndless, advance } from '../src/rules/run';
import { settleRun } from '../src/rules/meta';
import { defaultMeta } from '../src/core/save';
import { dailySetup } from '../src/rules/daily';
import { masteryLevel } from '../src/data/mastery';

const mk = (seed = 1, char = 'gambler', table = 'classic') => {
  const run = newRun(seed, char, 0, { unlocked: [] }, { table });
  return { run, ctx: { run, emit: () => {} } };
};

describe('업적 · 숙련도 · 엔드리스 · 일일 도전 · 테이블', () => {
  it('업적을 달성하면 보상이 해금되고, 같은 업적은 한 번만', () => {
    const meta = defaultMeta();
    const { run } = mk();
    run.stats.yahtzees = 1;
    run.flags.ach_max_hit = 60;
    run.screen = 'gameover';
    const r = settleRun(meta, run);
    expect(r.achievements).toContain('yahtzee');
    expect(r.achievements).toContain('hit50');
    expect(meta.owned).toContain('table:six');
    expect(meta.owned).toContain('table:glass');
    const r2 = settleRun(meta, run);
    expect(r2.achievements).toEqual([]);
  });

  it('숙련도 경험치가 쌓이고 레벨업 보상', () => {
    const meta = defaultMeta();
    const { run } = mk();
    run.nodesReached = 15; run.bossesKilled = 3; run.screen = 'victory';
    const r = settleRun(meta, run);
    expect(r.masteryXp).toBe(15 + 15 + 20);
    expect(masteryLevel(meta.mastery.gambler)).toBe(3);
    expect(meta.owned).toContain('skin:ruby');
    expect(meta.owned).toContain('felt:red');
  });

  it('클리어 후 엔드리스로 4막, 두 번째 정산은 늘어난 부분만', () => {
    const meta = defaultMeta();
    const { run, ctx } = mk(5);
    run.act = 3; run.floor = 4; run.nodesReached = 15; run.bossesKilled = 3;
    advance(ctx);
    expect(run.screen).toBe('victory');
    const r1 = settleRun(meta, run);
    continueEndless(ctx);
    expect(run.act).toBe(4);
    expect(run.screen).toBe('map');
    run.nodesReached = 18;
    run.screen = 'gameover';
    const r2 = settleRun(meta, run);
    expect(r2.points).toBe(3);
    expect(meta.stats.runs).toBe(1);
    expect(r1.points).toBe(30);
    expect(meta.bestEndless).toBe(4);
  });

  it('일일 도전은 날짜가 같으면 같은 판', () => {
    expect(dailySetup('2026-11-18')).toEqual(dailySetup('2026-11-18'));
    expect(dailySetup('2026-11-18').seed).not.toBe(dailySetup('2026-11-19').seed);
  });

  it('시작 테이블이 출발 조건을 바꾼다', () => {
    expect(mk(1, 'gambler', 'six').run.dice.length).toBe(6);
    expect(mk(1, 'gambler', 'golden').run.gold).toBe(60);
    expect(mk(1, 'gambler', 'glass').run.dice.every((d) => d.material === 'glass')).toBe(true);
    expect(mk(1, 'gambler', 'chips').run.skills.length).toBe(3);
  });
});
