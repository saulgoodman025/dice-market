import type { App } from './app';
import { sfx } from '../audio/sfx';
import { clearRun } from '../core/save';
import { CONSUMABLE_BY_ID } from '../data/consumables';
import { SKILL_BY_ID, condText } from '../data/skills';
import {
  autoPick, canUse, confirmHand, endTurn, nudgeDie, reroll, setDieValue, setTarget, toggleLock, useConsumable, useSkill,
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

export function handleAction(app: App, act: string, arg: string) {
  const ui = app.ui;
  const run = app.run;
  const n = Number(arg);
  sfx.click();
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
      if (cb.phase === 'roll') { toggleLock(ctx, n); sfx.lock(); }
      else ui.sel = ui.sel.includes(n) ? ui.sel.filter((k) => k !== n) : [...ui.sel, n];
      app.render();
      maybeTutorial(app);
      return;
    }
    case 'target': if (cb) setTarget(ctx, n); break;
    case 'reroll': if (cb) { reroll(ctx); } break;
    case 'confirm': if (cb) { confirmHand(ctx); ui.sel = []; } break;
    case 'slot': {
      if (!cb || cb.phase === 'over') break;
      const sel = cb.phase === 'roll' ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : ui.sel;
      let keys: number[] | null = canUse(ctx, n, sel) ? sel : null;
      if (!keys) keys = autoPick(ctx, n, sel);
      const def = SKILL_BY_ID[run.skills[n]?.id];
      if (!def) break;
      if (!keys) {
        app.toast(cb.usedSlots[n] ? '이번 턴에 이미 사용한 칸' : `조건: ${condText(def.cond)}`, 'bad');
        sfx.bad();
        vibrate(20);
        return;
      }
      if (def.needsChoice) {
        ui.picker = { mode: 'fate', slot: n, keys };
        app.render();
        return;
      }
      useSkill(ctx, n, keys);
      ui.sel = [];
      app.after();
      maybeTutorial(app);
      return;
    }
    case 'endTurn': if (cb) { endTurn(ctx); ui.sel = []; ui.picker = null; maybeTutorial(app); } break;
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
      const r = doubleOrNothing(ctx);
      if (!r) return;
      app.queue.splice(0);
      animateDon(app, r.frames, r.win);
      return;
    }
    case 'collect': collectRewardGold(ctx); break;
    case 'freespin': {
      if (run.pendingFreeSpins <= 0) return;
      run.pendingFreeSpins--;
      ui.casinoTab = 'slot';
      const res = slotSpin(ctx, { free: true });
      if (res) { animateSlot(app, res); return; }
      break;
    }
    case 'pick': pickReward(ctx, n); break;
    case 'leaveReward': leaveReward(ctx); break;
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
      if (d === null) app.toast('골드가 부족하다', 'bad');
      else app.toast(`🎲 리롤 주사위 ${d}${d === 6 ? ' — 다음 리롤 무료!' : ''}`, d === 6 ? 'gold' : 'info');
      break;
    }
    case 'buyChip': if (!buyChip(ctx)) app.toast('골드가 부족하다', 'bad'); break;
    case 'leaveShop': leaveShop(ctx); ui.shopEdit = false; break;
    case 'shopEdit': ui.shopEdit = !ui.shopEdit; break;
    // ── 선택(펜딩) ──
    case 'editDie': ui.editDie = n; break;
    case 'applyFace': applyFace(ctx, Math.min(ui.editDie, run.dice.length - 1), n); break;
    case 'applyMat': applyMaterial(ctx, n); break;
    case 'replaceSkill': replaceSkill(ctx, n < 0 ? null : n); break;
    case 'upgrade': upgradeSkill(ctx, n); break;
    case 'cancelPending': cancelPending(ctx); break;
    case 'offer': pickOffer(ctx, n < 0 ? null : n); break;
    // ── 카지노 ──
    case 'tab': ui.casinoTab = arg as typeof ui.casinoTab; break;
    case 'spin': {
      const res = slotSpin(ctx);
      if (!res) { app.toast('칩이 없다 (상점에서 8G = 칩 1)', 'bad'); return; }
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
      const r = rouletteSpin(ctx, bets);
      if (!r) { app.toast('먼저 칩을 걸자', 'bad'); return; }
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

function maybeTutorial(app: App) {
  const ui = app.ui;
  const cb = app.run?.combat;
  if (!cb || ui.tutorialStep > 3) return;
  if (cb.turn > ui.tutorialStep) ui.tutorialStep = cb.turn;
}
