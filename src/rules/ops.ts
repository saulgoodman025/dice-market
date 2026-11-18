// 상태 변경 기본 연산. 데이터(스킬/유물/적)의 효과 함수가 이걸 호출한다.
import type { CombatState, Enemy, HandDie, RunState } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMY_BY_ID } from '../data/enemies';
import { CONSUMABLE_BY_ID } from '../data/consumables';
import { fire, rng, sources, toast, type Ctx } from './ctx';

export const cbOf = (ctx: Ctx): CombatState => {
  if (!ctx.run.combat) throw new Error('not in combat');
  return ctx.run.combat;
};

export const alive = (cb: CombatState): Enemy[] => cb.enemies.filter((e) => e.hp > 0);

export function targetEnemy(cb: CombatState): Enemy | undefined {
  const a = alive(cb);
  return a.find((e) => e.uid === cb.target) ?? a[0];
}

export interface DmgInfo {
  pip?: number; // 피해를 낸 주사위 눈 (적 특수 판정용)
  crit?: boolean;
  raw?: boolean; // 방어 무시 없음, 보정 없음 표시용
  source?: string;
}

export function damageEnemy(ctx: Ctx, e: Enemy, amount: number, info: DmgInfo = {}): number {
  const cb = cbOf(ctx);
  if (e.hp <= 0) return 0;
  const def = ENEMY_BY_ID[e.id];
  let amt = Math.max(0, Math.round(amount));
  if (def.modIncoming) amt = Math.max(0, Math.round(def.modIncoming(ctx, e, amt, info)));
  if (e.enraged) amt = Math.round(amt * 1.0);
  const blocked = Math.min(e.block, amt);
  e.block -= blocked;
  const dealt = amt - blocked;
  e.hp = Math.max(0, e.hp - dealt);
  ctx.emit({ t: 'dmgEnemy', uid: e.uid, amount: dealt, crit: info.crit, blocked, src: info.source });
  if (dealt > 0) def.onDamaged?.(ctx, e, dealt);
  if (e.hp <= 0) killEnemy(ctx, e);
  void cb;
  return dealt;
}

export function killEnemy(ctx: Ctx, e: Enemy) {
  const cb = cbOf(ctx);
  e.hp = 0;
  ctx.run.stats.kills++;
  ctx.emit({ t: 'enemyDie', uid: e.uid });
  ENEMY_BY_ID[e.id].onDeath?.(ctx, e);
  fire(ctx, 'onKill', { enemy: e });
  if (alive(cb).length === 0) {
    cb.result = 'win';
    cb.phase = 'over';
  } else if (cb.target === e.uid) {
    cb.target = alive(cb)[0].uid;
  }
}

export function damagePlayer(ctx: Ctx, amount: number, source: string, opts: { ignoreBlock?: boolean } = {}): number {
  const run = ctx.run;
  const cb = run.combat;
  let amt = Math.max(0, Math.round(amount));
  let blocked = 0;
  if (cb && !opts.ignoreBlock) {
    const total = cb.block + cb.keepBlock;
    blocked = Math.min(total, amt);
    // keepBlock(요새)부터 소모
    const fromKeep = Math.min(cb.keepBlock, blocked);
    cb.keepBlock -= fromKeep;
    cb.block -= blocked - fromKeep;
    amt -= blocked;
  }
  run.hp -= amt;
  if (cb) cb.dmgTaken += amt;
  ctx.emit({ t: 'dmgPlayer', amount: amt, blocked, src: source });
  if (run.hp <= 0) {
    for (const s of sources(run)) {
      if (s.saveLethal?.(ctx)) {
        if (run.hp <= 0) run.hp = 1;
        break;
      }
    }
  }
  if (run.hp <= 0) {
    run.hp = 0;
    run.stats.deathBy = source;
    if (cb) {
      cb.result = 'lose';
      cb.phase = 'over';
    }
  }
  return amt;
}

export function gainBlock(ctx: Ctx, amount: number) {
  const cb = cbOf(ctx);
  const a = Math.max(0, Math.round(amount));
  cb.block += a;
  ctx.emit({ t: 'block', amount: a });
}

export function healPlayer(ctx: Ctx, amount: number) {
  const run = ctx.run;
  const a = Math.max(0, Math.min(run.maxHp - run.hp, Math.round(amount)));
  run.hp += a;
  if (a > 0) ctx.emit({ t: 'heal', amount: a });
}

export function gainGold(ctx: Ctx, amount: number) {
  const a = Math.round(amount);
  ctx.run.gold = Math.max(0, ctx.run.gold + a);
  if (a > 0) ctx.run.stats.goldEarned += a;
  if (a !== 0) ctx.emit({ t: 'gold', amount: a });
}

export function gainChips(ctx: Ctx, amount: number) {
  const a = Math.round(amount);
  ctx.run.chips = Math.max(0, ctx.run.chips + a);
  if (a !== 0) ctx.emit({ t: 'chips', amount: a });
}

export function addPiggy(ctx: Ctx, amount: number) {
  const cb = cbOf(ctx);
  cb.piggy = Math.max(0, cb.piggy + Math.round(amount));
}

export function addHeat(ctx: Ctx, n: number) {
  const run = ctx.run;
  const before = run.heat;
  run.heat = Math.max(0, Math.min(BALANCE.heatMax, run.heat + n));
  if (run.heat !== before) ctx.emit({ t: 'heat', heat: run.heat });
}

export function resetHeat(ctx: Ctx) {
  if (ctx.run.heat !== 0) {
    ctx.run.heat = 0;
    ctx.emit({ t: 'heat', heat: 0 });
  }
}

export function addJackpot(ctx: Ctx, pct: number) {
  const run = ctx.run;
  const before = run.jackpot;
  run.jackpot = Math.min(BALANCE.jackpotMax, run.jackpot + pct);
  if (before < BALANCE.jackpotMax && run.jackpot >= BALANCE.jackpotMax) ctx.emit({ t: 'jackpotFull' });
}

export function addEnemyPoison(e: Enemy, n: number) {
  e.poison += Math.max(0, Math.round(n));
}

export function randomEnemy(ctx: Ctx): Enemy | undefined {
  const a = alive(cbOf(ctx));
  if (!a.length) return undefined;
  return rng(ctx, 'combat').pick(a);
}

export function addConsumable(ctx: Ctx, id: string): boolean {
  if (ctx.run.consumables.length >= BALANCE.maxConsumables) {
    toast(ctx, '소모품 칸이 가득 찼다', 'bad');
    return false;
  }
  ctx.run.consumables.push(id);
  toast(ctx, `${CONSUMABLE_BY_ID[id].emoji} ${CONSUMABLE_BY_ID[id].name} 획득`, 'good');
  return true;
}

export function handDieFree(hd: HandDie, cb: CombatState) {
  return !hd.used && !cb.brokenDice.includes(hd.dieIdx);
}

export function maxHpChange(run: RunState, delta: number) {
  run.maxHp = Math.max(1, run.maxHp + delta);
  run.hp = Math.min(run.hp, run.maxHp);
}
