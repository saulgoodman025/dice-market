// 지속 버프 규칙: 걸기, 수치 합산, 턴 진행
import type { Buff, CombatState } from '../core/state';
import { BUFF_BY_ID, ZERO_FX, type BuffFx } from '../data/buffs';
import { toast, type Ctx } from './ctx';
import { gainBlock } from './ops';

/** 버프 걸기. 같은 id가 이미 있으면 turns는 큰 쪽, value는 합산(또는 큰 쪽) */
export function addBuff(cb: CombatState, b: Buff) {
  const def = BUFF_BY_ID[b.id];
  const old = cb.buffs.find((x) => x.id === b.id && x.owner === b.owner);
  if (old) {
    old.turns = Math.max(old.turns, b.turns);
    old.value = def?.stack === 'max' ? Math.max(old.value, b.value) : old.value + b.value;
    return;
  }
  cb.buffs.push({ ...b });
}

export function buffsOf(cb: CombatState, owner: Buff['owner']): Buff[] {
  return cb.buffs.filter((b) => b.owner === owner);
}

/** 주인의 버프 수치 합 */
export function buffFx(cb: CombatState | null | undefined, owner: Buff['owner'] = 'player'): BuffFx {
  const out = ZERO_FX();
  if (!cb) return out;
  for (const b of cb.buffs) {
    if (b.owner !== owner) continue;
    const fx = BUFF_BY_ID[b.id]?.fx?.(b);
    if (!fx) continue;
    for (const [k, v] of Object.entries(fx)) {
      if (k === 'freeTags') out.freeTags.push(...(v as BuffFx['freeTags']));
      else (out as unknown as Record<string, number>)[k] += v as number;
    }
  }
  return out;
}

/** 내 💪 힘 = 기본 힘 + 힘 버프 */
export function playerStr(cb: CombatState): number {
  return cb.pStr + buffFx(cb).str;
}

/** 받아넘기기 같은 횟수형 버프 1회 소모 (그 수치를 내는 버프를 찾아 값 -1) */
export function consumeFx(cb: CombatState, key: keyof BuffFx, owner: Buff['owner'] = 'player') {
  const b = cb.buffs.find((x) => x.owner === owner && !!BUFF_BY_ID[x.id]?.fx?.(x)?.[key]);
  if (!b) return;
  b.value--;
  if (b.value <= 0) cb.buffs = cb.buffs.filter((x) => x !== b);
}

const TURN_START: Record<string, (ctx: Ctx, b: Buff) => void> = {
  block: (ctx, b) => gainBlock(ctx, b.value),
  piggy: (ctx, b) => { ctx.run.combat!.piggy += b.value; },
  piggyPct: (ctx, b) => { const cb = ctx.run.combat!; cb.piggy += Math.round(cb.piggy * b.value / 100); },
  six: (ctx, b) => { ctx.run.combat!.next.six += b.value; },
  chips: (ctx, b) => { ctx.run.combat!.handChips += b.value; },
  enemyPoison: (ctx, b) => { const e = ctx.run.combat!.enemies.find((x) => x.uid === b.owner && x.hp > 0); if (e) e.poison += b.value; },
};

/**
 * 내 턴 시작에 호출 (적 행동이 끝난 뒤, 주사위 굴리기 전).
 * - 'end' 버프: 지난 턴 끝에 한 턴이 지난 것으로 보고 1 줄인다 (적의 공격을 받는 동안에는 남아 있도록 여기서 줄인다)
 * - 'start' 버프: 효과를 내고 1 줄인다
 */
export function tickBuffsTurnStart(ctx: Ctx) {
  const cb = ctx.run.combat!;
  if (cb.turn <= 1) return;
  const keep: Buff[] = [];
  for (const b of cb.buffs) {
    const def = BUFF_BY_ID[b.id];
    if (!def) continue;
    if (typeof b.owner === 'number' && !cb.enemies.some((e) => e.uid === b.owner && e.hp > 0)) continue;
    if (def.tick === 'start' && def.onTurnStart) TURN_START[def.onTurnStart]?.(ctx, b);
    if (b.turns !== Infinity) b.turns--;
    if (b.turns > 0) keep.push(b);
    else if (b.owner === 'player') toast(ctx, `${def.icon} ${def.name} 끝`, 'info');
  }
  cb.buffs = keep;
}
