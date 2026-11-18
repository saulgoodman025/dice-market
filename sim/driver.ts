// 헤드리스 한 판 실행기. UI 없이 rules만 사용한다.
import { mulberry32Next } from '../src/core/rng';
import type { RunState } from '../src/core/state';
import type { Ctx } from '../src/rules/ctx';
import { finishCombat, newRun, flowBand } from '../src/rules/run';
import type { FlowBand } from '../src/rules/dda';

export interface Bot {
  name: string;
  chooseNode(ctx: Ctx, r: BotRng): number;
  combatStep(ctx: Ctx, r: BotRng): void; // 한 턴 진행 (endTurn 포함)
  reward(ctx: Ctx, r: BotRng): void; // 보상 화면 처리 후 leaveReward
  shop(ctx: Ctx, r: BotRng): void;
  casino(ctx: Ctx, r: BotRng): void;
  event(ctx: Ctx, r: BotRng): void;
  rest(ctx: Ctx, r: BotRng): void;
  resolve(ctx: Ctx, r: BotRng): void; // pending/offer 처리
}

/** 봇 전용 난수 (게임 RNG와 분리) */
export class BotRng {
  constructor(private s: number) {}
  next() { const [s, v] = mulberry32Next(this.s); this.s = s; return v; }
  int(lo: number, hi: number) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  chance(p: number) { return this.next() < p; }
}

export interface RunResult {
  won: boolean;
  nodes: number;
  deathBy: string | null;
  yahtzees: number;
  jackpotTurns: number;
  gambles: number;
  relics: string[];
  bands: FlowBand[];
  act: number;
}

export function playRun(bot: Bot, seed: number, charId = 'gambler', stake = 0): RunResult {
  const run: RunState = newRun(seed, charId, stake);
  const ctx: Ctx = { run, emit: () => {} };
  const r = new BotRng(seed ^ 0x1234567);
  const bands: FlowBand[] = [];
  let guard = 0;
  while (guard++ < 5000) {
    if (run.pending || run.offer) { bot.resolve(ctx, r); if (run.pending || run.offer) { run.pending = null; run.offer = null; } continue; }
    switch (run.screen) {
      case 'map': bands.push(flowBand(run)); bot.chooseNode(ctx, r); break;
      case 'combat': {
        const cb = run.combat!;
        if (cb.result) { finishCombat(ctx); break; }
        if (cb.turn > 60) { cb.result = 'lose'; run.stats.deathBy = '시간 초과'; run.hp = 0; break; }
        bot.combatStep(ctx, r);
        break;
      }
      case 'reward': bot.reward(ctx, r); break;
      case 'shop': bot.shop(ctx, r); break;
      case 'casino': bot.casino(ctx, r); break;
      case 'event': bot.event(ctx, r); break;
      case 'rest': bot.rest(ctx, r); break;
      default: break;
    }
    if (run.screen === 'gameover' || run.screen === 'victory') break;
  }
  return {
    won: run.screen === 'victory', nodes: run.nodesReached, deathBy: run.stats.deathBy, yahtzees: run.stats.yahtzees,
    jackpotTurns: run.stats.jackpotTurns, gambles: run.stats.gambles, relics: [...run.relics], bands, act: run.act,
  };
}
