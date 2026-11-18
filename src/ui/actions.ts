import type { App } from './app';
import { sfx } from '../audio/sfx';
import { clearRun, saveMeta } from '../core/save';
import { CONSUMABLE_BY_ID } from '../data/consumables';
import { SKILL_BY_ID, condText } from '../data/skills';
import {
  autoPick, canUse, chipsAvailable, confirmHand, endTurn, nudgeDie, reroll, setDieValue, setTarget, toggleLock, useConsumable, useSkill,
} from '../rules/combat';
import {
  applyFace, applyMaterial, buyChip, cancelPending, casinoHighroller, collectRewardGold, enterNode, eventChoose, leaveCasino,
  leaveReward, leaveShop, offerFaces, pickOffer, pickReward, replaceSkill, restHeal, restUpgrade, shopApplyPricetag, shopBuy,
  shopReroll, upgradeSkill, useConsumableOutside, advance,
} from '../rules/run';
import { doubleOrNothing, haggle, openMystery, rouletteSpin, scratchCard, slotSpin } from '../rules/casino';
import type { RouletteBet } from '../data/casino';
import { animateDon, animateRoulette, animateSlot } from './screens/casino';
import { vibrate } from './fx/fx';
import { COACH } from './coach';

const TUT_STEPS = COACH.length;

export function handleAction(app: App, act: string, arg: string) {
  const ui = app.ui;
  const run = app.run;
  const n = Number(arg);
  if (act !== 'cardTap') sfx.click();
  switch (act) {
    // ── 타이틀/메뉴 ──
    case 'new': ui.page = 'charselect'; ui.stakeSel = Math.min(ui.stakeSel, app.meta.maxStake); break;
    case 'continue': ui.page = 'run'; break;
    case 'codex': ui.page = 'codex'; break;
    case 'settings': ui.page = 'settings'; break;
    case 'back': ui.page = run && run.screen !== 'gameover' && run.screen !== 'victory' ? 'title' : 'title'; ui.modal = null; break;
    case 'codexTab': ui.codexTab = arg as typeof ui.codexTab; break;
    case 'char': ui.charSel = arg; break;
    case 'stake': ui.stakeSel = Math.max(0, Math.min(app.meta.maxStake, n)); break;
    case 'start': app.startRun(ui.charSel, ui.stakeSel); ui.end = null; break;
    case 'set': {
      const k = arg as 'sound' | 'shake' | 'vibrate';
      app.settings[k] = !app.settings[k];
      app.applySettings();
      break;
    }
    case 'speed': app.settings.speed = app.settings.speed === 1 ? 2 : 1; app.applySettings(); break;
    case 'modal': ui.modal = arg as typeof ui.modal; break;
    case 'relicInfo': {
      const el = app.view.querySelector<HTMLElement>(`[data-act="relicInfo"][data-arg="${arg}"]`);
      if (el) app.tipAt(el);
      return;
    }
    case 'helpTab': ui.helpTab = arg as typeof ui.helpTab; break;
    case 'tutOpen': ui.tut = 1; ui.modal = null; break;
    case 'tutNext': ui.tut = ui.tut >= TUT_STEPS ? 0 : ui.tut + 1; if (ui.tut === 0) finishTutorial(app); break;
    case 'tutSkip': ui.tut = 0; finishTutorial(app); break;
    case 'closeModal': ui.modal = null; ui.scratch = null; ui.mystery = null; break;
    case 'quit': ui.modal = 'quit'; break;
    case 'abandon':
      if (run) { run.screen = 'gameover'; run.stats.deathBy = '포기'; app.endRun(); }
      ui.modal = null;
      break;
    case 'toTitle': app.run = null; clearRun(); ui.page = 'title'; ui.end = null; break;
    case 'again': app.run = null; clearRun(); ui.end = null; ui.page = 'charselect'; break;
    default:
      if (!run) break;
      runAction(app, act, arg, n);
      return;
  }
  app.render();
}

function runAction(app: App, act: string, arg: string, n: number) {
  const ui = app.ui;
  const run = app.run!;
  const ctx = app.ctx;
  const cb = run.combat;
  switch (act) {
    // ── 소모품 ──
    case 'useCons': {
      const id = run.consumables[n];
      const def = CONSUMABLE_BY_ID[id];
      if (!def) break;
      if (def.when === 'ui') {
        run.consumables.splice(n, 1);
        if (id === 'scratch') { const s = scratchCard(ctx); ui.scratch = { ...s, rev: s.grid.map(() => false) }; ui.modal = 'scratch'; }
        if (id === 'mystery') { const m = openMystery(ctx); ui.mystery = { ...m, opened: false }; ui.modal = 'mystery'; app.queue.splice(0); }
        app.render();
        return;
      }
      if (def.when === 'passive') { app.toast(`${def.name}: ${def.desc}`, 'info'); return; }
      if (def.when === 'shop') { app.toast('상점에서 상품의 🏷️ 버튼으로 사용', 'info'); return; }
      if (def.when === 'combat') {
        if (!cb) { app.toast('전투 중에만 사용 가능', 'bad'); return; }
        useConsumable(ctx, n, def);
      } else if (cb) useConsumable(ctx, n, def);
      else useConsumableOutside(ctx, n);
      ui.modal = null;
      break;
    }
    // ── 맵 ──
    case 'node': enterNode(ctx, n); ui.sel = []; break;
    // ── 전투 ──
    case 'die': {
      if (!cb) break;
      if (ui.picker) { pickerDie(app, n); return; }
      ui.infoKey = n;
      if (cb.hand.find((h) => h.key === n)?.used) { app.render(); return; }
      if (cb.phase === 'roll') { toggleLock(ctx, n); sfx.lock(); }
      else ui.sel = ui.sel.includes(n) ? ui.sel.filter((k) => k !== n) : [...ui.sel, n];
      app.render();
      return;
    }
    case 'target': {
      if (!cb) break;
      if (ui.selCard !== null) {
        const slot = ui.selCard;
        const def = SKILL_BY_ID[run.skills[slot]?.id];
        ui.selCard = null;
        playSkill(app, slot, def?.target === 'enemy' ? n : null);
        return;
      }
      setTarget(ctx, n);
      break;
    }
    case 'reroll': if (cb) { reroll(ctx); } break;
    case 'confirm': if (cb) { confirmHand(ctx); ui.sel = []; } break;
    case 'slot': playSkill(app, n, null); return;
    case 'cardTap': {
      // 카드 탭: 선택/해제 (드래그가 어려울 때 보조 수단)
      if (!cb) return;
      if (ui.selCard === n) { ui.selCard = null; app.render(); return; }
      if (!cardPlayable(app, n, true)) return;
      ui.selCard = n;
      app.render();
      return;
    }
    case 'field': {
      // 선택한 카드를 테이블에 놓기 (대상 없는 스킬 / 적이 하나뿐일 때)
      if (!cb || ui.selCard === null) return;
      const def = SKILL_BY_ID[run.skills[ui.selCard]?.id];
      const alive = cb.enemies.filter((e) => e.hp > 0);
      if (def?.target === 'enemy' && alive.length > 1) { app.toast('공격할 적을 탭하세요', 'info'); return; }
      const slot = ui.selCard;
      ui.selCard = null;
      playSkill(app, slot, null);
      return;
    }
    case 'endTurn': {
      if (!cb) break;
      const hp0 = run.hp;
      const blk0 = cb.block + cb.keepBlock;
      endTurn(ctx);
      ui.sel = [];
      ui.picker = null;
      ui.selCard = null;
      ui.infoKey = -1;
      app.after({ enemyPhase: { hp0, blk0 } });
      return;
    }
    case 'openSet': ui.picker = { mode: 'set' }; app.render(); return;
    case 'openNudge': ui.picker = { mode: 'nudge' }; app.render(); return;
    case 'cancelPicker': ui.picker = null; app.render(); return;
    case 'pickerDie': pickerDie(app, n); return;
    case 'pickerVal': {
      const p = ui.picker;
      if (!p || p.target === undefined || !cb) return;
      if (p.mode === 'fate') useSkill(ctx, p.slot!, p.keys!, { key: p.target, value: n });
      else if (p.mode === 'set') setDieValue(ctx, p.target, n);
      else if (p.mode === 'nudge') nudgeDie(ctx, p.target, n > 0 ? 1 : -1);
      ui.picker = null;
      ui.sel = [];
      break;
    }
    // ── 보상 ──
    case 'don': {
      const rw = run.reward;
      const before = rw ? { gold: rw.gold, streak: rw.donStreak } : undefined;
      const r = doubleOrNothing(ctx);
      if (!r) return;
      app.queue.splice(0);
      animateDon(app, r.frames, r.win, before);
      return;
    }
    case 'collect': collectRewardGold(ctx); break;
    case 'freespin': {
      if (run.pendingFreeSpins <= 0) return;
      run.pendingFreeSpins--;
      ui.casinoTab = 'slot';
      ui.freeze = { gold: run.gold, chips: run.chips, hp: run.hp };
      const res = slotSpin(ctx, { free: true });
      if (!res) ui.freeze = null;
      if (res) { animateSlot(app, res); return; }
      break;
    }
    case 'pick': pickReward(ctx, n); if (!run.pending && !run.offer) leaveReward(ctx); break;
    case 'rewardSel': ui.rewardSel = n; app.render(); return;
    case 'rewardConfirm': {
      if (ui.rewardSel === null) return;
      const i = ui.rewardSel;
      ui.rewardSel = null;
      pickReward(ctx, i);
      if (!run.pending && !run.offer) leaveReward(ctx);
      break;
    }
    case 'leaveReward': ui.rewardSel = null; leaveReward(ctx); break;
    // ── 상점 ──
    case 'haggle': {
      const d = haggle(ctx, n);
      if (d !== null) app.toast(`🎲 흥정 주사위 ${d}: ${d === 6 ? '공짜!' : d === 1 ? '바가지...' : `${d * 5}% 할인`}`, d === 6 ? 'gold' : d === 1 ? 'bad' : 'good');
      break;
    }
    case 'buy': if (!shopBuy(ctx, n)) { app.toast('골드가 부족하다', 'bad'); sfx.bad(); } break;
    case 'pricetag': shopApplyPricetag(ctx, n); break;
    case 'shopReroll': {
      const d = shopReroll(ctx);
      if (d === null) app.toast(run.shop && run.shop.rerolls >= 1 ? '리롤은 상점마다 1번' : '골드가 부족하다', 'bad');
      break;
    }
    case 'buyChip': if (!buyChip(ctx)) app.toast('골드가 부족하다', 'bad'); break;
    case 'leaveShop': leaveShop(ctx); ui.shopEdit = false; break;
    case 'shopEdit': ui.shopEdit = !ui.shopEdit; break;
    // ── 선택(펜딩) ──
    case 'editDie': ui.editDie = n; ui.pickFace = null; break;
    case 'pickFace': ui.pickFace = n; app.render(); return;
    case 'pickMat': ui.pickMat = n; app.render(); return;
    case 'confirmFace': if (ui.pickFace !== null) applyFace(ctx, Math.min(ui.editDie, run.dice.length - 1), ui.pickFace); ui.pickFace = null; break;
    case 'confirmMat': if (ui.pickMat !== null) applyMaterial(ctx, ui.pickMat); ui.pickMat = null; break;
    case 'applyFace': applyFace(ctx, Math.min(ui.editDie, run.dice.length - 1), n); break;
    case 'applyMat': applyMaterial(ctx, n); break;
    case 'pickSlot': ui.pickSlot = n; app.render(); return;
    case 'replaceSkill': replaceSkill(ctx, n < 0 ? null : n); ui.pickSlot = null; break;
    case 'replaceConfirm': if (ui.pickSlot !== null) replaceSkill(ctx, ui.pickSlot); ui.pickSlot = null; break;
    case 'upgradeConfirm': if (ui.pickSlot !== null) { upgradeSkill(ctx, ui.pickSlot); ui.restPick = null; } ui.pickSlot = null; break;
    case 'upgrade': upgradeSkill(ctx, n); break;
    case 'cancelPending': cancelPending(ctx); ui.pickSlot = null; break;
    case 'offer': pickOffer(ctx, n < 0 ? null : n); break;
    // ── 카지노 ──
    case 'tab': ui.casinoTab = arg as typeof ui.casinoTab; break;
    case 'spin': {
      ui.freeze = { gold: run.gold, chips: run.chips - 1, hp: run.hp };
      const res = slotSpin(ctx);
      if (!res) {
        ui.freeze = null; app.toast('칩이 없다 (상점에서 8G = 칩 1)', 'bad'); return; }
      animateSlot(app, res);
      return;
    }
    case 'bet': {
      const total = Object.values(ui.bets).reduce((a, b) => a + b, 0);
      if (total >= run.chips) { app.toast('칩이 부족하다', 'bad'); return; }
      ui.bets[arg] = (ui.bets[arg] ?? 0) + 1;
      sfx.chip();
      break;
    }
    case 'clearBets': ui.bets = {}; break;
    case 'spinRoulette': {
      const bets = Object.entries(ui.bets).filter(([, c]) => c > 0).map(([bet, chips]) => ({ bet: bet as RouletteBet, chips }));
      ui.freeze = { gold: run.gold, chips: run.chips - bets.reduce((a, b) => a + b.chips, 0), hp: run.hp };
      const r = rouletteSpin(ctx, bets);
      if (!r) {
        ui.freeze = null; app.toast('먼저 칩을 걸자', 'bad'); return; }
      animateRoulette(app, r.n, r.won);
      return;
    }
    case 'high': {
      const r = casinoHighroller(ctx, arg);
      if (!r) { app.toast('판돈이 부족하다', 'bad'); return; }
      ui.high = { d: r.d, win: r.win, text: r.win ? '승리! 유물 획득' : '패배...' };
      if (r.win) sfx.jackpot(); else sfx.lose();
      break;
    }
    case 'leaveCasino': ui.slot = { res: null, spinning: false }; ui.bets = {}; ui.high = { d: null, win: false, text: '' }; leaveCasino(ctx); break;
    case 'scratchCell': if (ui.scratch) { ui.scratch.rev[n] = true; sfx.tick(); } break;
    case 'scratchAll': if (ui.scratch) { ui.scratch.rev = ui.scratch.rev.map(() => true); if (ui.scratch.wins.length) sfx.jackpot(); } break;
    case 'mysteryOpen': if (ui.mystery) { ui.mystery.opened = true; sfx.jackpot(); } break;
    // ── 이벤트/휴식 ──
    case 'evChoice': eventChoose(ctx, n); break;
    case 'evLeave': advance(ctx); break;
    case 'restHeal': restHeal(ctx); break;
    case 'restUp': restUpgrade(ctx); break;
    case 'restPick': ui.restPick = arg as 'heal' | 'up'; app.render(); return;
    case 'restConfirm':
      if (ui.restPick === 'heal') { ui.restPick = null; restHeal(ctx); }
      else if (ui.restPick === 'up') restUpgrade(ctx);
      break;
    case 'restBack': run.pending = null; ui.pickSlot = null; break;
    case 'faceOffer': offerFaces(ctx, run.screen); break;
    default: break;
  }
  app.after();
}

function pickerDie(app: App, key: number) {
  const p = app.ui.picker;
  if (!p) return;
  if (p.mode === 'fate' && p.keys?.includes(key)) return;
  p.target = key;
  app.render();
}


function finishTutorial(app: App) {
  if (app.run) app.run.flags.tutorial = 0;
  app.meta.tutorialDone = true;
  saveMeta(app.meta);
}

/** 이 카드를 지금 쓸 수 있는가 (안 되면 이유를 알려준다) */
export function cardPlayable(app: App, slot: number, explain: boolean): boolean {
  const run = app.run!;
  const cb = run.combat;
  if (!cb || cb.phase === 'over' || app.ui.busy) return false;
  const def = SKILL_BY_ID[run.skills[slot]?.id];
  if (!def) return false;
  const sel = cb.phase === 'roll' ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : app.ui.sel;
  const ok = canUse(app.ctx, slot, sel) || !!autoPick(app.ctx, slot, sel);
  if (!ok && explain) {
    const short = def.cost > chipsAvailable(app.ctx);
    app.toast(cb.usedSlots[slot] ? '이번 턴에 이미 쓴 카드' : short ? `🔶 족보 칩이 부족하다 (필요 ${def.cost}, 보유 ${chipsAvailable(app.ctx)})` : `이 카드는 ${condText(def.cond)} 주사위가 필요하다`, 'bad');
    sfx.bad();
    vibrate(20);
  }
  return ok;
}

/** 스킬 카드 사용. targetUid가 있으면 그 적을 대상으로 */
export function playSkill(app: App, slot: number, targetUid: number | null) {
  const run = app.run!;
  const cb = run.combat;
  const ui = app.ui;
  const ctx = app.ctx;
  if (!cb || cb.phase === 'over') return;
  if (!cardPlayable(app, slot, true)) return;
  if (targetUid !== null) setTarget(ctx, targetUid);
  const sel = cb.phase === 'roll' ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : ui.sel;
  const keys = canUse(ctx, slot, sel) ? sel : autoPick(ctx, slot, sel)!;
  const def = SKILL_BY_ID[run.skills[slot].id];
  ui.selCard = null;
  if (def.needsChoice) {
    ui.picker = { mode: 'fate', slot, keys };
    app.render();
    return;
  }
  useSkill(ctx, slot, keys);
  ui.sel = [];
  app.after();
}
