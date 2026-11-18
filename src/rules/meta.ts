import type { Meta } from '../core/save';
import type { RunState } from '../core/state';
import { META_LOCKED_START, META_POINTS_PER_UNLOCK } from '../data/meta';
import { ACHIEVEMENTS, type AchCtx } from '../data/achievements';
import { MASTERY_REWARDS, masteryLevel } from '../data/mastery';
import { dailyScore } from './daily';

export function runPoints(run: RunState): number {
  return run.nodesReached + run.bossesKilled * 5;
}

export function nextUnlockIn(meta: Meta): number {
  const avail = meta.points - meta.spent;
  return META_POINTS_PER_UNLOCK - (avail % META_POINTS_PER_UNLOCK);
}

export interface SettleResult {
  points: number;
  unlocked: string[];
  achievements: string[];
  masteryXp: number;
  masteryLevelUp: { level: number; reward: string; story?: string }[];
  dailyScore: number | null;
  endlessAct: number;
}

/** 판 종료 정산. 엔드리스로 이어간 판은 두 번 정산되므로, 두 번째에는 늘어난 부분만 반영한다 */
export function settleRun(meta: Meta, run: RunState): SettleResult {
  const won = run.screen === 'victory' || !!run.flags.endless;
  const first = !run.flags.settled;
  const prevNodes = run.flags.settledNodes ?? 0;
  const prevBosses = run.flags.settledBosses ?? 0;
  const pts = Math.max(0, run.nodesReached - prevNodes) + Math.max(0, run.bossesKilled - prevBosses) * 5;
  run.flags.settled = 1;
  run.flags.settledNodes = run.nodesReached;
  run.flags.settledBosses = run.bossesKilled;
  meta.points += pts;
  if (first) {
    meta.stats.runs++;
    if (run.screen === 'victory') meta.stats.wins++;
    meta.stats.yahtzees += run.stats.yahtzees;
    meta.stats.megaJackpots += run.stats.megaJackpots;
  }
  meta.stats.bestNodes = Math.max(meta.stats.bestNodes, run.nodesReached);
  for (const k of ['act1boss', 'act2', 'clear']) if (run.flags['meta_' + k]) meta.flags[k] = 1;
  if (run.screen === 'victory') meta.maxStake = Math.max(meta.maxStake, Math.min(8, run.stake + 1));
  if (run.flags.endless) meta.bestEndless = Math.max(meta.bestEndless ?? 0, run.act);
  const add = (arr: string[], v: string) => { if (!arr.includes(v)) arr.push(v); };
  for (const k of Object.keys(run.flags)) {
    if (k.startsWith('seen_relic_')) add(meta.codex.relics, k.slice(11));
    if (k.startsWith('seen_face_')) add(meta.codex.faces, k.slice(10));
    if (k.startsWith('seen_enemy_')) add(meta.codex.enemies, k.slice(11));
    if (k.startsWith('seen_hand_')) add(meta.codex.hands, k.slice(10));
  }
  for (const r of run.relics) add(meta.codex.relics, r);
  const unlocked: string[] = [];
  while (meta.points - meta.spent >= META_POINTS_PER_UNLOCK) {
    const next = META_LOCKED_START.find((l) => !meta.unlocked.includes(`${l.kind}:${l.id}`));
    if (!next) break;
    meta.spent += META_POINTS_PER_UNLOCK;
    meta.unlocked.push(`${next.kind}:${next.id}`);
    unlocked.push(`${next.kind}:${next.id}`);
  }
  // ── 업적 ──
  const achieved: string[] = [];
  const winsByChar: Record<string, number> = {};
  const ctx: AchCtx = { run, won: run.screen === 'victory', totals: { runs: meta.stats.runs, wins: meta.stats.wins, dailies: Object.keys(meta.daily ?? {}).length, winsByChar } };
  meta.achievements = meta.achievements ?? [];
  meta.owned = meta.owned ?? [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements.includes(a.id) || !a.check(ctx)) continue;
    meta.achievements.push(a.id);
    achieved.push(a.id);
    grantReward(meta, a.reward, unlocked);
  }
  // ── 캐릭터 숙련도 ──
  meta.mastery = meta.mastery ?? {};
  const xp = pts + (first && run.screen === 'victory' ? 20 : 0);
  const before = masteryLevel(meta.mastery[run.charId] ?? 0);
  meta.mastery[run.charId] = (meta.mastery[run.charId] ?? 0) + xp;
  const after = masteryLevel(meta.mastery[run.charId]);
  const levelUps = (MASTERY_REWARDS[run.charId] ?? []).filter((r) => r.level > before && r.level <= after);
  for (const r of levelUps) if (r.reward !== 'story') grantReward(meta, r.reward, unlocked);
  // ── 일일 도전 ──
  let score: number | null = null;
  if (run.dailyKey) {
    score = dailyScore(run.nodesReached, run.bossesKilled, run.gold, run.screen === 'victory' || !!run.flags.endless);
    meta.daily = meta.daily ?? {};
    meta.daily[run.dailyKey] = Math.max(meta.daily[run.dailyKey] ?? 0, score);
  }
  return { points: pts, unlocked, achievements: achieved, masteryXp: xp, masteryLevelUp: levelUps, dailyScore: score, endlessAct: run.flags.endless ? run.act : 0 };
}

/** 보상 지급: 상점 풀 해금(skill/relic/face) 또는 소유물(table/skin/felt) */
function grantReward(meta: Meta, reward: string, unlocked: string[]) {
  const [kind] = reward.split(':');
  if (kind === 'table' || kind === 'skin' || kind === 'felt') {
    if (!meta.owned.includes(reward)) meta.owned.push(reward);
  } else if (!meta.unlocked.includes(reward)) {
    meta.unlocked.push(reward);
    unlocked.push(reward);
  }
}
