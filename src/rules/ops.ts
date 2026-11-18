// 상태 변경 기본 연산. 데이터(스킬/유물/적)의 효과 함수가 이걸 호출한다.
import type { CombatState, Enemy, HandDie, RunState } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMY_BY_ID } from '../data/enemies';
import { CONSUMABLE_BY_ID } from '../data/consumables';
import { fire, getMods, rng, sources, toast, type Ctx } from './ctx';
import { buffFx, consumeFx } from './buffs';

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
  if (e.immunePip && info.pip === e.immunePip && amt > 0) amt = 0; // 🚫 면역 눈
  const weakHit = info.pip !== undefined && info.pip === e.weakPip && amt > 0;
  if (e.vuln > 0 && info.source !== '독' && amt > 0) amt = Math.round(amt * (BALANCE.vulnMult + getMods(ctx.run).vulnExtra));
  if (weakHit) { amt = Math.round(amt * BALANCE.weakMult); addJackpot(ctx, BALANCE.weakJackpot); }
  if (def.modIncoming) amt = Math.max(0, Math.round(def.modIncoming(ctx, e, amt, info)));
  if (e.enraged) amt = Math.round(amt * 1.0);
  const blocked = Math.min(e.block, amt);
  e.block -= blocked;
  let dealt = amt - blocked;
  // 튜토리얼 동안 적은 체력 1 아래로 내려가지 않는다 (끝까지 배울 수 있게)
  if (ctx.run.flags.tutorial && e.hp - dealt < 1) dealt = Math.max(0, e.hp - 1);
  e.hp = Math.max(0, e.hp - dealt);
  ctx.run.flags.ach_max_hit = Math.max(ctx.run.flags.ach_max_hit ?? 0, dealt);
  if (weakHit) ctx.run.flags.ach_weak_hits = (ctx.run.flags.ach_weak_hits ?? 0) + 1;
  if (e.hp <= 0 && info.source === '독') ctx.run.flags.ach_poison_kill = 1;
  ctx.emit({ t: 'dmgEnemy', uid: e.uid, amount: dealt, crit: info.crit, blocked, src: info.source, weakHit });
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
  if (ENEMY_BY_ID[e.id].tier === 'boss' && cb.turnCounters.yahtzee) ctx.run.flags.ach_yahtzee_boss = 1;
  const def = ENEMY_BY_ID[e.id];
  def.onDeath?.(ctx, e);
  fire(ctx, 'onKill', { enemy: e });
  const kh = getMods(ctx.run).killHeal;
  if (kh) healPlayer(ctx, kh);
  // 분열 부활: 쓰러지면 작은 적 여럿으로 갈라진다 (한 번만)
  if (def.splitOnDeath && !e.splitDone) {
    const hp = Math.max(1, Math.round(e.maxHp * def.splitOnDeath.hpPct));
    for (let i = 0; i < def.splitOnDeath.count; i++) {
      cb.enemies.push({ ...e, uid: ctx.run.nextUid++, hp, maxHp: hp, block: 0, poison: 0, vuln: 0, frail: 0, splitDone: true, name: e.name + ' 조각', patternIdx: i % def.pattern.length, intent: { ...e.intent } });
    }
    toast(ctx, `🧬 ${e.name}이(가) ${def.splitOnDeath.count}개로 갈라져 되살아났다!`, 'bad');
  }
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
    const fx = buffFx(cb);
    if (fx.immune && amt > 0) { amt = 0; toast(ctx, '✨ 이지스: 피해 무효', 'good'); }
    if (fx.halveHits && amt > 0) { amt = Math.ceil(amt / 2); consumeFx(cb, 'halveHits'); }
    if (amt > 0 && getMods(run).ironwill && !cb.counters.ironwill && cb.block + cb.keepBlock >= 30) {
      cb.counters.ironwill = 1;
      amt = 0;
      toast(ctx, '🗿 강철 의지: 공격 무효', 'good');
    }
  }
  if (cb && !opts.ignoreBlock) {
    const total = cb.block + cb.keepBlock;
    blocked = Math.min(total, amt);
    // keepBlock(요새)부터 소모
    const fromKeep = Math.min(cb.keepBlock, blocked);
    cb.keepBlock -= fromKeep;
    cb.block -= blocked - fromKeep;
    amt -= blocked;
    const fx = buffFx(cb);
    if (fx.riposte && blocked > 0) cb.counters.ripBonus = (cb.counters.ripBonus ?? 0) + Math.round(blocked * fx.riposte / 100);
    if (fx.hedgePct && amount > 0) cb.piggy += Math.round(Math.round(amount) * fx.hedgePct / 100);
  }
  if (run.flags.tutorial && run.hp - amt < 1) amt = Math.max(0, run.hp - 1);
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
  if (a <= 0) return;
  fire(ctx, 'onBlockGain', { amount: a });
  // 방패 3단계: 방어도를 얻을 때마다 무작위 적에게 피해
  const pct = getMods(ctx.run).blockToDmgPct;
  if (pct && !cb.result) {
    const t = randomEnemy(ctx);
    if (t) damageEnemy(ctx, t, Math.max(1, Math.round(a * pct / 100)), { source: '방패 반격' });
  }
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
  ctx.run.flags.ach_max_gold = Math.max(ctx.run.flags.ach_max_gold ?? 0, ctx.run.gold);
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
  const m = pct > 0 ? 1 + getMods(run).jackpotGainPct / 100 : 1;
  run.jackpot = Math.min(BALANCE.jackpotMax, run.jackpot + pct * m);
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
