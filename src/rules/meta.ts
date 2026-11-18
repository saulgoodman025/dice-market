import type { Meta } from '../core/save';
import type { RunState } from '../core/state';
import { META_LOCKED_START, META_POINTS_PER_UNLOCK } from '../data/meta';

export function runPoints(run: RunState): number {
  return run.nodesReached + run.bossesKilled * 5;
}

export function nextUnlockIn(meta: Meta): number {
  const avail = meta.points - meta.spent;
  return META_POINTS_PER_UNLOCK - (avail % META_POINTS_PER_UNLOCK);
}

/** 판 종료 정산. 새로 해금된 항목 목록 반환 */
export function settleRun(meta: Meta, run: RunState): { points: number; unlocked: string[] } {
  const pts = runPoints(run);
  meta.points += pts;
  meta.stats.runs++;
  if (run.screen === 'victory') meta.stats.wins++;
  meta.stats.yahtzees += run.stats.yahtzees;
  meta.stats.megaJackpots += run.stats.megaJackpots;
  meta.stats.bestNodes = Math.max(meta.stats.bestNodes, run.nodesReached);
  for (const k of ['act1boss', 'act2', 'clear']) if (run.flags['meta_' + k]) meta.flags[k] = 1;
  if (run.screen === 'victory') meta.maxStake = Math.max(meta.maxStake, Math.min(8, run.stake + 1));
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
  return { points: pts, unlocked };
}
