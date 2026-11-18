import { EventBus } from '../core/events';
import { clearRun, loadMeta, loadRun, loadSettings, saveMeta, saveRun, saveSettings, type Meta, type Settings } from '../core/save';
import type { GameEvent, RunState } from '../core/state';
import type { Ctx } from '../rules/ctx';
import { finishCombat, newRun, SAVE_VERSION, updateFlow } from '../rules/run';
import { settleRun } from '../rules/meta';
import { sfx, setSound, setTempo } from '../audio/sfx';
import { burstAt, coinRain, dmgSize, floatAt, hitstop, initFx, setFx, shake, vibrate } from './fx/fx';
import { BALANCE } from '../data/balance';
import { HAND_BY_ID } from '../data/hands';
import { fxRandom } from '../core/rng';
import { pipsHtml } from './components/parts';
import { renderScreen } from './screens/index';
import { handleAction } from './actions';
import { ENEMY_BY_ID } from '../data/enemies';
import type { SlotResult } from '../rules/casino';

export type Page = 'title' | 'charselect' | 'codex' | 'settings' | 'run';

export interface Ui {
  page: Page;
  sel: number[];
  picker: null | { mode: 'fate' | 'set' | 'nudge'; slot?: number; keys?: number[]; target?: number };
  casinoTab: 'slot' | 'roulette' | 'high';
  bets: Record<string, number>;
  modal: null | 'paytable' | 'bag' | 'settings' | 'scratch' | 'mystery' | 'quit' | 'hands';
  editDie: number;
  busy: boolean;
  charSel: string;
  stakeSel: number;
  scratch: { grid: string[]; wins: string[]; rev: boolean[] } | null;
  mystery: { rarity: string; relic: string | null; opened: boolean } | null;
  slot: { res: SlotResult | null; spinning: boolean } ;
  roulette: { n: number | null; won: number; spinning: boolean };
  high: { d: [number, number] | null; win: boolean; text: string };
  don: { rolling: boolean; face: number; text: string };
  end: { points: number; unlocked: string[] } | null;
  codexTab: 'relic' | 'face' | 'enemy' | 'hand';
  shopEdit: boolean;
  infoKey: number;
  tut: number;
}

export class App {
  root: HTMLElement;
  view: HTMLElement;
  toasts: HTMLElement;
  run: RunState | null = null;
  meta: Meta = loadMeta();
  settings: Settings = loadSettings();
  bus = new EventBus();
  queue: GameEvent[] = [];
  debug = new URLSearchParams(location.search).has('debug');
  ui: Ui = {
    page: 'title', sel: [], picker: null, casinoTab: 'slot', bets: {}, modal: null, editDie: 0, busy: false,
    charSel: 'gambler', stakeSel: 0, scratch: null, mystery: null, slot: { res: null, spinning: false },
    roulette: { n: null, won: 0, spinning: false }, high: { d: null, win: false, text: '' },
    don: { rolling: false, face: 6, text: '' }, end: null, codexTab: 'relic', shopEdit: false, infoKey: -1, tut: 0,
  };
  private tipEl: HTMLElement | null = null;
  private piggyAnimated: unknown = null;
  private resultPending = false;
  veil = false;
  private tipTimer = 0;
  private suppressClick = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.view = document.createElement('div');
    this.view.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;';
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    root.append(this.view, this.toasts);
    initFx(root);
    this.applySettings();
    this.bus.on((e) => this.queue.push(e));
    const saved = loadRun(SAVE_VERSION);
    if (saved) this.run = saved;
    this.bindInput();
    this.render();
  }

  get ctx(): Ctx {
    if (!this.run) throw new Error('no run');
    return { run: this.run, emit: this.bus.emit };
  }

  applySettings() {
    setSound(this.settings.sound);
    setTempo(this.settings.speed);
    setFx({ shake: this.settings.shake, vibrate: this.settings.vibrate, speed: this.settings.speed });
    saveSettings(this.settings);
  }

  startRun(charId: string, stake: number) {
    const seed = (Date.now() ^ Math.floor(fxRandom() * 1e9)) >>> 0;
    this.run = newRun(seed, charId, stake, { unlocked: this.meta.unlocked });
    this.ui.page = 'run';
    this.save();
  }

  save() {
    if (this.run && this.run.screen !== 'gameover' && this.run.screen !== 'victory') saveRun(this.run);
  }

  endRun() {
    if (!this.run) return;
    const res = settleRun(this.meta, this.run);
    this.meta.tutorialDone = true;
    saveMeta(this.meta);
    clearRun();
    this.ui.end = res;
  }

  // ── 입력 ──
  private bindInput() {
    this.root.addEventListener('click', (ev) => {
      if (this.suppressClick) { this.suppressClick = false; ev.preventDefault(); return; }
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      const act = t.dataset.act!;
      const arg = t.dataset.arg ?? '';
      if (this.ui.busy && !t.dataset.always) return;
      handleAction(this, act, arg);
    });
    // 롱프레스 툴팁
    this.root.addEventListener('pointerdown', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      this.hideTip();
      if (!t) return;
      const x = ev.clientX;
      const y = ev.clientY;
      this.tipTimer = window.setTimeout(() => { this.showTip(t.dataset.tip!, x, y); this.suppressClick = true; }, 420);
    });
    const cancel = () => { clearTimeout(this.tipTimer); setTimeout(() => this.hideTip(), 1400); };
    this.root.addEventListener('pointerup', cancel);
    this.root.addEventListener('pointercancel', cancel);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private showTip(text: string, x: number, y: number) {
    this.hideTip();
    const r = this.root.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'tip';
    d.textContent = text;
    this.root.appendChild(d);
    const w = d.offsetWidth;
    d.style.left = `${Math.max(6, Math.min(r.width - w - 6, x - r.left - w / 2))}px`;
    d.style.top = `${Math.max(6, y - r.top - d.offsetHeight - 16)}px`;
    this.tipEl = d;
    vibrate(10);
  }
  private hideTip() {
    this.tipEl?.remove();
    this.tipEl = null;
  }

  toast(text: string, tone: 'good' | 'bad' | 'info' | 'gold' = 'info') {
    const d = document.createElement('div');
    d.className = `toast ${tone}`;
    d.textContent = text;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => d.remove(), 2100);
  }

  // ── 렌더 ──
  render() {
    const run = this.run;
    this.root.classList.toggle('fever', !!run && run.screen === 'combat' && run.heat >= BALANCE.feverAt);
    this.view.innerHTML = renderScreen(this);
    if (this.debug && run) {
      updateFlow(run);
      const d = document.createElement('div');
      d.className = 'debug';
      d.textContent = debugText(run);
      this.view.appendChild(d);
    }
  }

  /** 규칙 실행 후 호출: 저장 → 렌더 → 연출 */
  after(opts: { noRender?: boolean; enemyPhase?: { hp0: number } } = {}) {
    const run = this.run;
    const events = this.queue.splice(0);
    const phase = !!opts.enemyPhase && events.some((e) => e.t === 'enemyAct');
    this.veil = phase;
    if (!opts.noRender) this.render();
    const dur = this.playFx(events, phase ? opts.enemyPhase!.hp0 : null);
    if (phase && !run?.combat?.result) {
      this.ui.busy = true;
      setTimeout(() => { this.ui.busy = false; }, dur / this.settings.speed);
    }
    if (run?.screen === 'combat' && run.combat?.result && !this.resultPending) {
      const cb = run.combat;
      this.resultPending = true;
      this.ui.busy = true;
      const boss = cb.kind === 'boss';
      const close = cb.result === 'win' && boss && run.hp <= run.maxHp * 0.1;
      const wait = Math.max(close ? 1300 : 900, dur + 500) / this.settings.speed;
      setTimeout(() => {
        if (close) document.documentElement.style.setProperty('--speed', String(this.settings.speed * 0.4));
        if (cb.result === 'win') { sfx.win(); this.banner('승리!', 'win'); }
        if (cb.result === 'lose') { sfx.lose(); this.banner('패배...', 'enemy'); }
      }, Math.max(0, wait - 800 / this.settings.speed));
      setTimeout(() => {
        document.documentElement.style.setProperty('--speed', String(this.settings.speed));
        this.ui.busy = false;
        this.resultPending = false;
        this.ui.sel = [];
        this.ui.picker = null;
        finishCombat(this.ctx);
        if (run.screen === 'gameover') this.endRun();
        this.after();
      }, wait + (close ? 500 : 0));
    }
    if (run?.screen === 'reward' && run.reward && this.piggyAnimated !== run.reward) {
      this.piggyAnimated = run.reward;
      this.piggyCountUp(run.reward.piggy);
    }
    if (run && (run.screen === 'victory' || run.screen === 'gameover') && !this.ui.end) this.endRun();
    this.save();
  }

  private el(sel: string): Element | null {
    return this.view.querySelector(sel);
  }

  /** 큰 배너 (내 턴 / 적의 턴 / 승리) */
  banner(text: string, tone: 'me' | 'enemy' | 'win') {
    const d = document.createElement('div');
    d.className = `turnbanner ${tone}`;
    d.textContent = text;
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 900 / this.settings.speed);
  }

  private setHp(v: number) {
    const run = this.run;
    if (!run) return;
    const bar = this.view.querySelector<HTMLElement>('.player .hpbar > i');
    const val = this.view.querySelector('.player .hpval');
    if (bar) bar.style.width = `${Math.max(0, (v / run.maxHp) * 100)}%`;
    if (val) val.textContent = String(Math.max(0, v));
  }

  private retrigger(el: Element | null, cls: string) {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
  }

  private slash(el: Element | null, crit?: boolean) {
    if (!el) return;
    const s = document.createElement('div');
    s.className = `slash ${crit ? 'crit' : ''}`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 400 / this.settings.speed);
  }

  /** 이벤트 연출. 적의 턴(hp0 지정)이면 적 행동을 하나씩 순서대로 보여준다. 총 소요(ms, 배속 전) 반환 */
  playFx(events: GameEvent[], hp0: number | null = null): number {
    let delay = 0;
    const sp = this.settings.speed;
    const at = (ms: number, fn: () => void) => { if (ms <= 0) fn(); else setTimeout(fn, ms / sp); };
    const enemyPhase = hp0 !== null;
    let hp = hp0 ?? 0;
    const lastAct = enemyPhase ? events.map((e) => e.t).lastIndexOf('enemyAct') : -1;
    let myTurnShown = !enemyPhase;
    if (enemyPhase) {
      this.setHp(hp);
      this.banner('적의 턴', 'enemy');
      delay = 700;
    }
    const showMyTurn = () => {
      if (myTurnShown) return;
      myTurnShown = true;
      delay += 650;
      at(delay, () => {
        this.veil = false;
        this.view.querySelector('.tray')?.classList.remove('veiled');
        this.view.querySelector('.screen.combat')?.classList.remove('enemyphase');
        this.setHp(this.run?.hp ?? 0);
        if (this.run?.combat && !this.run.combat.result) this.banner('내 턴', 'me');
      });
      delay += 250;
    };
    events.forEach((e, idx) => {
      if (enemyPhase && idx > lastAct && e.t === 'roll') showMyTurn();
      switch (e.t) {
        case 'roll': {
          const keys = e.keys;
          at(delay, () => { this.animateRoll(keys); sfx.roll(); });
          break;
        }
        case 'dmgEnemy': {
          at(delay, () => {
            const el = this.el(`[data-uid="${e.uid}"]`);
            if (e.amount > 0) {
              this.slash(el, e.crit);
              this.retrigger(el, 'hit');
              if (e.src && !['독', '반사'].includes(e.src)) floatAt(el, e.src, '#ffe9a8', 13);
              floatAt(el, `${e.crit ? '★' : '-'}${e.amount}`, e.crit ? '#ffd34d' : '#ffffff', dmgSize(e.amount) * (e.crit ? 1.6 : 1.15));
              if (e.crit) { shake(this.root, 8); hitstop(this.root, 100); sfx.crit(); vibrate(40); }
              else { shake(el, 4); hitstop(this.root, 50); sfx.hit(e.amount >= 20); }
            } else if (e.blocked) {
              floatAt(el, `🛡 ${e.blocked} 막힘`, '#4aa3ff', 17);
              sfx.block();
            } else floatAt(el, '무효', '#9aa', 16);
          });
          delay += 140;
          break;
        }
        case 'dmgPlayer': {
          const amt = e.amount;
          if (enemyPhase && idx < lastAct + 1) hp -= amt;
          else if (enemyPhase) hp -= amt;
          const shown = hp;
          at(delay + 160, () => {
            const plate = this.el('.player');
            if (amt > 0) {
              this.flashDamage();
              this.retrigger(plate, 'hurt');
              floatAt(this.el('.player .hpbar'), `-${amt}`, '#ff5a5f', dmgSize(amt) * 1.2);
              shake(this.root, Math.min(10, 3 + amt / 3));
              sfx.hurt();
              vibrate(60);
              if (enemyPhase) this.setHp(shown);
            }
            if (e.blocked > 0) { floatAt(this.el('.pblock'), `🛡 ${e.blocked} 막음`, '#4aa3ff', 16); sfx.block(); }
          });
          break;
        }
        case 'block': at(delay, () => { floatAt(this.el('.pblock'), `+${e.amount}🛡`, '#6cb8ff', 18); this.retrigger(this.el('.pblock'), 'pop'); sfx.block(); }); break;
        case 'heal': {
          if (enemyPhase) hp += e.amount;
          at(delay, () => { floatAt(this.el('.player .hpbar') ?? this.el('.hpbar'), `+${e.amount}`, '#3ddc84', 18); sfx.heal(); });
          break;
        }
        case 'gold': at(delay, () => { floatAt(this.el('.st-gold'), `${e.amount > 0 ? '+' : ''}${e.amount}G`, '#f5c542', 16); if (e.amount > 0) sfx.coin(); }); break;
        case 'chips': at(delay, () => { floatAt(this.el('.st-chips'), `${e.amount > 0 ? '+' : ''}${e.amount}🎰`, '#ff9de2', 15); sfx.chip(); }); break;
        case 'hand': at(delay + 650, () => this.handBanner(e.hand.id, e.hand.mult)); break;
        case 'yahtzee': at(delay + 700, () => this.yahtzeeFx()); break;
        case 'heat': if (e.heat >= BALANCE.heatMax) at(delay, () => this.toast('🔥 온 파이어! 다음 굴림 주사위 1개 = 6', 'gold')); break;
        case 'jackpotFull': at(delay + 300, () => { sfx.jackpot(); this.toast('💰 잭팟 100%! 다음 턴은 잭팟 턴', 'gold'); vibrate([60, 40, 60]); }); break;
        case 'enemyDie': at(delay + 150, () => { const el = this.el(`[data-uid="${e.uid}"]`); burstAt(el, '#ffd34d', 30); el?.classList.add('dying'); }); break;
        case 'enemyAct': {
          delay += enemyPhase ? 750 : 280;
          const uid = e.uid;
          at(delay, () => {
            const el = this.el(`[data-uid="${uid}"]`);
            this.retrigger(el, 'act');
            this.retrigger(el?.querySelector('.intent') ?? null, 'fire');
          });
          break;
        }
        case 'toast': { const tx = e.text; const tone = e.tone; at(delay, () => this.toast(tx, tone)); break; }
        case 'megaJackpot': at(delay + 400, () => this.megaFx()); break;
        case 'sfx': break;
      }
    });
    if (enemyPhase) showMyTurn();
    return delay + 200;
  }

  private flashDamage() {
    const v = document.createElement('div');
    v.className = 'vignette';
    this.root.appendChild(v);
    setTimeout(() => v.remove(), 450 / this.settings.speed);
  }

  /** 저금통 정산: 코인이 하나씩 쌓이는 소리 (최대 30개, 이후 빠르게) */
  piggyCountUp(total: number) {
    const el = this.view.querySelector('#piggyamt');
    if (!el || total <= 0) return;
    const ticks = Math.min(30, total);
    const sp = this.settings.speed;
    for (let i = 1; i <= ticks; i++) {
      setTimeout(() => {
        const v = Math.round((total * i) / ticks);
        const cur = this.view.querySelector('#piggyamt');
        if (cur) cur.textContent = `${v}G`;
        if (i % (ticks > 15 ? 2 : 1) === 0) sfx.coin();
        if (i === ticks) floatAt(cur, `+${total}G`, '#f5c542', 20);
      }, (i * (i > 20 ? 25 : 60)) / sp);
    }
  }

  animateRoll(keys: number[]) {
    const sp = this.settings.speed;
    keys.forEach((k, i) => {
      const el = this.view.querySelector<HTMLElement>(`[data-key="${k}"]`);
      if (!el) return;
      const final = el.innerHTML;
      el.classList.add('rolling');
      const stopAt = (600 + i * 80 + (i === keys.length - 1 ? 150 : 0)) / sp;
      const iv = window.setInterval(() => { el.innerHTML = pipsHtml(1 + Math.floor(fxRandom() * 6)); }, 70);
      setTimeout(() => {
        clearInterval(iv);
        el.innerHTML = final;
        el.classList.remove('rolling');
        sfx.tick();
      }, stopAt);
    });
  }

  handBanner(id: string, mult: number) {
    const bar = this.el('.handbar');
    if (!bar) return;
    const def = HAND_BY_ID[id as keyof typeof HAND_BY_ID];
    bar.classList.remove('banner-pop', 'preview');
    void (bar as HTMLElement).offsetWidth;
    bar.classList.add('banner-pop');
    const m = bar.querySelector('.hmult');
    if (m && mult > 1) {
      const t0 = performance.now();
      const dur = 450 / this.settings.speed;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        m.textContent = `×${(1 + (mult - 1) * p).toFixed(1)}`;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    sfx.hand(def.rank);
  }

  yahtzeeFx() {
    const black = document.createElement('div');
    black.className = 'blackout';
    this.root.appendChild(black);
    setTimeout(() => {
      black.remove();
      const fs = document.createElement('div');
      fs.className = 'fullscreen';
      fs.innerHTML = `<div class="row">${[1, 2, 3, 4, 5].map(() => `<div class="die golden">${pipsHtml(this.run?.combat?.hand[0]?.pip ?? 6)}</div>`).join('')}</div><div class="big">YAHTZEE!</div><div class="gold">×7.0 · 열기 +5 · 잭팟 +50%</div>`;
      this.root.appendChild(fs);
      sfx.yahtzee();
      vibrate([80, 50, 80, 50, 200]);
      const r = this.root.getBoundingClientRect();
      for (let i = 0; i < 5; i++) setTimeout(() => burstAtXY(r.width * (0.2 + fxRandom() * 0.6), r.height * (0.3 + fxRandom() * 0.3)), i * 150);
      setTimeout(() => fs.remove(), 1700 / this.settings.speed);
    }, 300 / this.settings.speed);
  }

  megaFx() {
    const fs = document.createElement('div');
    fs.className = 'fullscreen';
    fs.innerHTML = `<div class="big">MEGA<br>JACKPOT!</div><div class="gold" id="megaroll">0G</div>`;
    this.root.appendChild(fs);
    sfx.jackpot();
    coinRain(90);
    shake(this.root, 10);
    vibrate([100, 60, 100, 60, 300]);
    let n = 0;
    const iv = setInterval(() => { n += 7; const el = fs.querySelector('#megaroll'); if (el) el.textContent = `+${Math.min(100, n)}G`; if (n >= 100) clearInterval(iv); }, 60);
    setTimeout(() => fs.remove(), 3000 / this.settings.speed);
  }
}

function burstAtXY(x: number, y: number) {
  import('./fx/fx').then((m) => m.burst(x, y, '#ffd34d', 30, 7));
}

function debugText(run: RunState): string {
  const lines = [`flow ${run.dda.flow}  act ${run.act} floor ${run.floor}`];
  const b = run.dda.flow <= 25 ? '포기 직전: 상점 상위+15, 물약 고정, 적 체력-15%' : run.dda.flow <= 40 ? '고전: 상점 상위+7, 휴식/상점↑' : run.dda.flow <= 60 ? '몰입: 보정 없음' : run.dda.flow <= 80 ? '순항: 엘리트↑, 엘리트 보상+20%' : '압도: 카지노↑, 하이롤러 등급+1';
  lines.push(b);
  lines.push(`recent ${run.dda.recentScores.slice(-3).join(',')} turns ${run.dda.combatsTurns.slice(-3).join(',')}`);
  lines.push(`pity shops ${run.dda.shopsSinceEpic}/10  seed ${run.seed}`);
  if (run.combat) lines.push(run.combat.enemies.map((e) => `${ENEMY_BY_ID[e.id].name} ${e.hp}/${e.maxHp}`).join(' | '));
  return lines.join('\n');
}
