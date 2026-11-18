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
import { initCardDrag } from './drag';
import { drawCoach, coachActive } from './coach';
import { ENEMY_BY_ID } from '../data/enemies';

/** 강한 공격 연출 기준 피해량 */
const HIT_STRONG = 15;
const HIT_MASSIVE = 30;
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
  don: { rolling: boolean; face: number; text: string; before?: { gold: number; streak: number } };
  end: { points: number; unlocked: string[] } | null;
  codexTab: 'relic' | 'face' | 'enemy' | 'hand';
  shopEdit: boolean;
  infoKey: number;
  helpTab: 'hands' | 'dice';
  pickSlot: number | null;
  pickFace: number | null;
  selCard: number | null; // 탭으로 고른 스킬 카드
  restPick: 'heal' | 'up' | null;
  pickMat: number | null;
  /** 연출 중에는 결과가 반영되기 전 숫자를 보여준다 (결과 미리 노출 방지) */
  freeze: { gold: number; chips: number; hp: number } | null;
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
    don: { rolling: false, face: 6, text: '' }, end: null, codexTab: 'relic', shopEdit: false, infoKey: -1, tut: 0, helpTab: 'hands', pickSlot: null, pickFace: null, pickMat: null, selCard: null, restPick: null, freeze: null,
  };
  private tipEl: HTMLElement | null = null;
  private piggyAnimated: unknown = null;
  private resultPending = false;
  veil = false;
  private lastRenderKey = '';
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
    initCardDrag(this);
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
      // 고정된 설명은 다른 곳을 누르면 닫힌다 (같은 유물을 다시 누르면 그대로)
      if (this.tipPinned && t && t === this.tipFor) return;
      this.tipPinned = false;
      this.hideTip();
      if (!t) return;
      const x = ev.clientX;
      const y = ev.clientY;
      this.tipTimer = window.setTimeout(() => { this.showTip(t.dataset.tip!, x, y, t); this.suppressClick = true; }, 420);
    });
    const cancel = () => { clearTimeout(this.tipTimer); setTimeout(() => { if (!this.tipPinned) this.hideTip(); }, 1400); };
    // 마우스: 올리면 바로 설명
    this.root.addEventListener('pointerover', (ev) => {
      if (ev.pointerType !== 'mouse' || this.root.classList.contains('dragging') || ev.buttons) return;
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (!t || this.tipFor === t) return;
      const r = t.getBoundingClientRect();
      this.showTip(t.dataset.tip!, r.left + r.width / 2, r.top, t);
    });
    this.root.addEventListener('pointerout', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      const to = (ev.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]');
      if (t && t !== to && this.tipFor === t && !this.tipPinned) this.hideTip();
    });
    this.root.addEventListener('pointerup', cancel);
    this.root.addEventListener('pointercancel', cancel);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 드래그가 시작되면 길게 누르기 툴팁을 취소 */
  cancelTip() {
    clearTimeout(this.tipTimer);
    this.hideTip();
  }

  /** 드래그 직후 따라오는 클릭 한 번을 무시 */
  swallowClick() {
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);
  }

  private tipFor: HTMLElement | null = null;
  private tipPinned = false;

  /** 요소 위에 설명 풍선을 띄운다 (탭으로 연 경우 잠시 고정) */
  /** 탭으로 연 설명: 화면의 다른 곳을 누를 때까지 유지 */
  tipAt(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    this.showTip(el.dataset.tip ?? '', r.left + r.width / 2, r.top, el);
    this.tipPinned = true;
  }

  private showTip(text: string, x: number, y: number, el: HTMLElement | null = null) {
    this.hideTip();
    this.tipFor = el;
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
    this.tipFor = null;
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
    // 다시 그려도 스크롤 위치 유지 (같은 화면일 때)
    const key = `${this.ui.page}:${run?.screen ?? ''}:${this.ui.modal ?? ''}:${run?.pending?.kind ?? ''}:${run?.offer ? 1 : 0}`;
    const keep = key === this.lastRenderKey;
    const saved = keep ? [...this.view.querySelectorAll<HTMLElement>('.screen, .modal .box')].map((el) => el.scrollTop) : [];
    this.lastRenderKey = key;
    this.view.innerHTML = renderScreen(this);
    if (keep) this.view.querySelectorAll<HTMLElement>('.screen, .modal .box').forEach((el, i) => { if (saved[i]) el.scrollTop = saved[i]; });
    this.reapplyRecent();
    this.applyHpTrails();
    drawCoach(this);
    if (this.debug && run) {
      updateFlow(run);
      const d = document.createElement('div');
      d.className = 'debug';
      d.textContent = debugText(run);
      this.view.appendChild(d);
    }
  }

  /** 규칙 실행 후 호출: 저장 → 렌더 → 연출 */
  after(opts: { noRender?: boolean; enemyPhase?: { hp0: number; blk0: number } } = {}) {
    const run = this.run;
    const events = this.queue.splice(0);
    const ci = events.findIndex((e) => e.t === 'chanceRoll');
    if (ci >= 0 && !opts.enemyPhase) {
      const ev = events[ci] as Extract<GameEvent, { t: 'chanceRoll' }>;
      this.playFx(events.slice(0, ci));
      this.ui.busy = true;
      const ms = this.chanceFx(ev);
      setTimeout(() => {
        this.ui.busy = false;
        this.queue.unshift(...events.slice(ci + 1));
        this.after(opts);
      }, ms / this.settings.speed);
      this.save();
      return;
    }
    const phase = !!opts.enemyPhase && events.some((e) => e.t === 'enemyAct');
    this.veil = phase;
    if (!opts.noRender) this.render();
    const dur = this.playFx(events, phase ? opts.enemyPhase!.hp0 : null, phase ? opts.enemyPhase!.blk0 : 0);
    if (phase && !run?.combat?.result) {
      this.ui.busy = true;
      setTimeout(() => { this.ui.busy = false; if (coachActive(this)) this.render(); }, dur / this.settings.speed);
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
    if (!run?.pending) { this.ui.pickSlot = null; this.ui.pickFace = null; this.ui.pickMat = null; }
    if (run && run.screen !== 'reward' && (this.ui.don.text || this.ui.slot.res)) {
      this.ui.don = { rolling: false, face: 6, text: '' };
      this.ui.slot = { res: null, spinning: false };
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
    const bar = this.view.querySelector<HTMLElement>('.player .hpbar');
    const val = this.view.querySelector('.player .hpval');
    if (bar) this.trailTo(bar, 'p', Math.max(0, (v / run.maxHp) * 100));
    if (val) val.textContent = String(Math.max(0, v));
  }

  /** 체력바 기억값: 빨간 바는 즉시, 하얀 잔상은 뒤늦게 따라 줄어든다 */
  private hpMem = new Map<string, number>();
  private trailTimers = new Map<string, number>();
  private trailTo(bar: HTMLElement, key: string, pct: number) {
    const fill = bar.querySelector<HTMLElement>('i');
    const trail = bar.querySelector<HTMLElement>('s.trail');
    const old = this.hpMem.get(key) ?? pct;
    this.hpMem.set(key, pct);
    if (fill) { fill.style.transition = 'none'; fill.style.width = `${pct}%`; }
    if (!trail) return;
    clearTimeout(this.trailTimers.get(key));
    if (pct < old) {
      // 잔상은 이전 위치에서 잠시 멈췄다가 천천히 따라간다
      const cur = parseFloat(trail.style.width) || old;
      trail.style.transition = 'none';
      trail.style.width = `${Math.max(cur, old)}%`;
      trail.classList.add('hit');
      void trail.offsetWidth;
      this.trailTimers.set(key, window.setTimeout(() => {
        trail.style.transition = `width ${0.65 / this.settings.speed}s cubic-bezier(.3,.7,.4,1)`;
        trail.style.width = `${pct}%`;
        setTimeout(() => trail.classList.remove('hit'), 700 / this.settings.speed);
      }, 380 / this.settings.speed));
    } else {
      trail.style.transition = 'none';
      trail.style.width = `${pct}%`;
    }
  }

  /** 다시 그린 뒤 각 체력바에 잔상 적용 (적의 턴엔 플레이어 바를 연출이 직접 움직인다) */
  private applyHpTrails() {
    if (!this.run?.combat) { this.hpMem.clear(); return; }
    this.view.querySelectorAll<HTMLElement>('[data-hpk]').forEach((bar) => {
      const key = bar.dataset.hpk!;
      if (key === 'p' && this.veil) {
        const old = this.hpMem.get('p');
        const fill = bar.querySelector<HTMLElement>('i');
        const trail = bar.querySelector<HTMLElement>('s.trail');
        if (old !== undefined && fill && trail) { fill.style.width = `${old}%`; trail.style.width = `${old}%`; }
        return;
      }
      this.trailTo(bar, key, Number(bar.dataset.pct));
    });
  }

  /** 대상 요소와 같은 위치·크기의 연출 상자를 화면 밖 레이어(root)에 만든다. 화면을 다시 그려도 사라지지 않는다 */
  private anchor(el: Element | null, ms: number): HTMLElement | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const h = this.root.getBoundingClientRect();
    const a = document.createElement('div');
    a.className = 'fxanchor';
    a.style.cssText = `left:${r.left - h.left}px;top:${r.top - h.top}px;width:${r.width}px;height:${r.height}px`;
    this.root.appendChild(a);
    setTimeout(() => a.remove(), ms / this.settings.speed);
    return a;
  }

  /** 최근에 맞은 요소: 다시 그려진 뒤에도 흔들림 연출을 이어간다 */
  private recent = new Map<string, number>();
  private mark(sel: string, cls: string) {
    this.recent.set(`${sel}|${cls}`, performance.now());
  }
  private reapplyRecent() {
    const now = performance.now();
    for (const [k, t] of this.recent) {
      if (now - t > 350 / this.settings.speed) { this.recent.delete(k); continue; }
      const [sel, cls] = k.split('|');
      this.view.querySelector(sel)?.classList.add(cls);
    }
  }

  private retrigger(el: Element | null, cls: string) {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
  }

  private slash(el: Element | null, crit?: boolean, dir = '') {
    const host = this.anchor(el, 450);
    if (!host) return;
    const s = document.createElement('div');
    s.className = `slash ${crit ? 'crit' : ''} ${dir}`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 400 / this.settings.speed);
  }

  /** 이벤트 연출. 적의 턴(hp0 지정)이면 적 행동을 하나씩 순서대로 보여준다. 총 소요(ms, 배속 전) 반환 */
  playFx(events: GameEvent[], hp0: number | null = null, blk0 = 0): number {
    let delay = 0;
    const sp = this.settings.speed;
    const at = (ms: number, fn: () => void) => { if (ms <= 0) fn(); else setTimeout(fn, ms / sp); };
    const enemyPhase = hp0 !== null;
    let hp = hp0 ?? 0;
    let blk = blk0;
    const lastAct = enemyPhase ? events.map((e) => e.t).lastIndexOf('enemyAct') : -1;
    let myTurnShown = !enemyPhase;
    if (enemyPhase) {
      this.setHp(hp);
      this.setBlock(blk);
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
        const c = this.run?.combat;
        this.setBlock(c ? c.block + c.keepBlock : 0);
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
              if (e.blocked) { this.enemyShield(el); floatAt(el, `🛡${e.blocked}`, '#8cc6ff', 15); }
              const tier = e.amount >= HIT_MASSIVE ? 2 : e.amount >= HIT_STRONG ? 1 : 0;
              this.retrigger(el, 'hit');
              this.mark(`[data-uid="${e.uid}"]`, 'hit');
              if (tier === 2) this.massiveHit(el, e.amount, e.crit);
              else if (tier === 1) this.strongHit(el, e.amount, e.crit);
              else {
                this.slash(el, e.crit);
                floatAt(el, `${e.crit ? '★' : '-'}${e.amount}`, e.crit ? '#ffd34d' : '#ffffff', dmgSize(e.amount) * (e.crit ? 1.6 : 1.15));
                if (e.crit) { shake(this.root, 8); hitstop(this.root, 100); sfx.crit(); vibrate(40); }
                else { shake(el, 4); hitstop(this.root, 50); sfx.hit(false); }
              }
              if (e.weakHit) { floatAt(el, '약점!', '#f2b544', 18); this.retrigger(el?.querySelector('.weakpip') ?? null, 'pop'); }
              else if (e.src && !['독', '반사'].includes(e.src)) floatAt(el, e.src, '#ffe9a8', 13);
            } else if (e.blocked) {
              this.enemyShield(el);
              floatAt(el, `🛡 ${e.blocked} 막힘`, '#8cc6ff', 18);
              sfx.clang();
            } else floatAt(el, '무효', '#9aa', 16);
          });
          delay += e.amount >= HIT_MASSIVE ? 380 : e.amount >= HIT_STRONG ? 220 : 140;
          break;
        }
        case 'dmgPlayer': {
          const amt = e.amount;
          const blocked = e.blocked;
          if (enemyPhase) { hp -= amt; blk = Math.max(0, blk - blocked); }
          const shownHp = hp;
          const shownBlk = blk;
          const broke = blocked > 0 && amt > 0; // 방패가 뚫림
          // ① 방패로 막는 순간
          if (blocked > 0) {
            at(delay + 160, () => {
              this.shieldFx(blocked, broke, shownBlk);
              if (enemyPhase) this.setBlock(shownBlk);
            });
          }
          // ② 막지 못한 피해
          if (amt > 0) {
            at(delay + (blocked > 0 ? 420 : 160), () => {
              const plate = this.el('.player');
              this.flashDamage();
              this.retrigger(plate, 'hurt');
              this.mark('.player', 'hurt');
              floatAt(this.el('.player .hpbar'), `-${amt}`, '#ff5a5f', dmgSize(amt) * 1.2);
              shake(this.root, Math.min(10, 3 + amt / 3));
              sfx.hurt();
              vibrate(60);
              if (enemyPhase) this.setHp(shownHp);
            });
            if (blocked > 0) delay += 260;
          }
          if (amt === 0 && blocked === 0) at(delay + 160, () => floatAt(this.el('.player .hpbar'), '0', '#bbb', 20));
          if (enemyPhase) delay += 320; // 연속 공격은 한 대씩 따로 보이게
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
        case 'enemyDie': {
          const boss = this.run?.combat?.enemies.find((x) => x.uid === e.uid);
          if (boss && ENEMY_BY_ID[boss.id].tier === 'boss') {
            const wait = events.some((x) => x.t === 'yahtzee') ? 2600 : 200; // 야찌 연출이 끝난 뒤
            at(delay + wait, () => this.bossDeathFx(e.uid));
            delay += wait + 2100;
          } else at(delay + 150, () => { const el = this.el(`[data-uid="${e.uid}"]`); burstAt(el, '#ffd34d', 30); el?.classList.add('dying'); });
          break;
        }
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

  private enemyShield(el: Element | null) {
    const host = this.anchor(el, 550);
    if (!host) return;
    const sh = document.createElement('div');
    sh.className = 'eshield';
    sh.textContent = '🛡️';
    host.appendChild(sh);
    setTimeout(() => sh.remove(), 500 / this.settings.speed);
  }

  private setBlock(v: number) {
    const el = this.view.querySelector('.pblock');
    if (!el) return;
    el.textContent = `🛡${Math.max(0, v)}`;
    el.classList.toggle('zero', v <= 0);
  }

  /** 방어도로 공격을 막는 연출: 방패가 튀어나와 공격을 받아내고, 뚫리면 깨진다 */
  private shieldFx(blocked: number, broke: boolean, left: number) {
    const plate = this.el('.player');
    const host = this.anchor(plate, 850);
    if (!plate || !host) return;
    const sh = document.createElement('div');
    sh.className = `shieldfx ${broke ? 'broke' : ''}`;
    sh.innerHTML = `<span class="sh">🛡️</span><span class="shnum">${broke ? `${blocked} 막고 뚫림!` : left > 0 ? `${blocked} 막음!` : '완벽 방어!'}</span>`;
    host.appendChild(sh);
    this.retrigger(plate, 'guarded');
    this.mark('.player', 'guarded');
    this.retrigger(this.el('.pblock'), 'clang');
    const v = document.createElement('div');
    v.className = 'vignette blue';
    this.root.appendChild(v);
    setTimeout(() => v.remove(), 400 / this.settings.speed);
    burstAt(plate.querySelector('.pblock') ?? plate, broke ? '#cfe6ff' : '#8cc6ff', broke ? 26 : 16);
    shake(this.root, 3);
    if (broke) sfx.shieldBreak(); else sfx.clang();
    vibrate(broke ? [20, 30, 40] : 25);
  }

  /** 색종이 축하 */
  confetti(n: number) {
    const colors = ['#f2b544', '#ff6b6b', '#6fdc9b', '#8cc4ff', '#b57cff', '#ffffff'];
    const h = this.root.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = `${fxRandom() * h.width}px`;
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', `${(fxRandom() - 0.5) * 120}px`);
      c.style.setProperty('--rot', `${fxRandom() * 720}deg`);
      c.style.animationDelay = `${fxRandom() * 0.4}s`;
      c.style.animationDuration = `${(1.6 + fxRandom() * 1.2) / this.settings.speed}s`;
      this.root.appendChild(c);
      setTimeout(() => c.remove(), 3300 / this.settings.speed);
    }
  }

  private flash(cls = 'white') {
    const f = document.createElement('div');
    f.className = `screenflash ${cls}`;
    this.root.appendChild(f);
    setTimeout(() => f.remove(), 400 / this.settings.speed);
  }

  private ring(el: Element | null, color: string) {
    const host = this.anchor(el, 650);
    if (!host) return;
    const r = document.createElement('div');
    r.className = 'shockring';
    r.style.borderColor = color;
    host.appendChild(r);
    setTimeout(() => r.remove(), 600 / this.settings.speed);
  }

  /** 강타 (15+): 십자 베기 + 충격파 */
  private strongHit(el: Element | null, amt: number, crit?: boolean) {
    this.slash(el, crit);
    setTimeout(() => this.slash(el, true, 'rev'), 70 / this.settings.speed);
    this.ring(el, '#ffb347');
    floatAt(el, `${crit ? '★' : ''}${amt}!`, '#ffb347', dmgSize(amt) * 1.6);
    floatAt(el, '강타!', '#ffd34d', 18);
    hitstop(this.root, 90);
    // 멈춤이 끝난 뒤 흔들림·진동 (강타: 중간 세기)
    setTimeout(() => { shake(this.view, 9, 380); vibrate(70); }, 90 / this.settings.speed);
    sfx.heavy();
    if (crit) sfx.crit();
  }

  /** 초강타 (30+): 화면 번쩍 + 줌 펀치 + 큰 충격파 + 거대한 숫자 */
  private massiveHit(el: Element | null, amt: number, crit?: boolean) {
    this.flash('white');
    this.retrigger(this.root, 'punch');
    this.slash(el, true);
    setTimeout(() => this.slash(el, true, 'rev'), 60 / this.settings.speed);
    setTimeout(() => this.slash(el, true, 'flat'), 120 / this.settings.speed);
    this.ring(el, '#ff5a3c');
    setTimeout(() => this.ring(el, '#ffd34d'), 120 / this.settings.speed);
    burstAt(el, '#ff9a3c', 34);
    floatAt(el, `${crit ? '★' : ''}${amt}!!`, '#ff6a3d', dmgSize(amt) * 2.1);
    floatAt(el, '초강타!!', '#ffd34d', 22);
    hitstop(this.root, 160);
    // 초강타: 더 크고 길게 흔들리고, 진동도 더 길고 세게 (두 번 몰아침)
    setTimeout(() => { shake(this.view, 18, 650); vibrate([140, 50, 200]); }, 160 / this.settings.speed);
    setTimeout(() => shake(this.view, 8, 300), (160 + 650) / this.settings.speed);
    sfx.heavy();
    sfx.crit();
  }

  /** 보스 격파: 체력바가 깨져 흩어지고 보스가 폭발한다 */
  private bossDeathFx(uid: number) {
    const el = this.el(`[data-uid="${uid}"]`);
    if (!el) return;
    const sp = this.settings.speed;
    hitstop(this.root, 300);
    this.flash('white');
    el.classList.add('bossdie');
    sfx.heavy();
    vibrate([100, 50, 100, 50, 300]);
    // 체력바 산산조각
    const bar = el.querySelector('.ehp');
    if (bar) {
      const r = bar.getBoundingClientRect();
      const h = this.root.getBoundingClientRect();
      const N = 12;
      for (let i = 0; i < N; i++) {
        const f = document.createElement('div');
        f.className = 'hpfrag';
        f.style.left = `${r.left - h.left + (r.width / N) * i}px`;
        f.style.top = `${r.top - h.top}px`;
        f.style.width = `${r.width / N + 1}px`;
        f.style.height = `${r.height}px`;
        f.style.setProperty('--dx', `${(fxRandom() - 0.5) * 260}px`);
        f.style.setProperty('--dy', `${-60 - fxRandom() * 160}px`);
        f.style.setProperty('--rot', `${(fxRandom() - 0.5) * 720}deg`);
        this.root.appendChild(f);
        setTimeout(() => f.remove(), 1300 / sp);
      }
      (bar as HTMLElement).style.visibility = 'hidden';
    }
    sfx.shieldBreak();
    // 연쇄 폭발
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        const h = this.root.getBoundingClientRect();
        burstAtXY(r.left - h.left + r.width * (0.2 + fxRandom() * 0.6), r.top - h.top + r.height * (0.2 + fxRandom() * 0.6));
        shake(this.root, 10);
        if (i % 2 === 0) sfx.explosion();
      }, (250 + i * 180) / sp);
    }
    setTimeout(() => {
      this.flash('gold');
      coinRain(60);
      sfx.fanfare();
      const b = document.createElement('div');
      b.className = 'bossdown';
      b.innerHTML = `<div class="bd1">BOSS DOWN!</div><div class="bd2">보스 격파</div>`;
      this.root.appendChild(b);
      setTimeout(() => b.remove(), 1500 / sp);
    }, 1200 / sp);
  }

  /** 운에 맡기는 스킬: 실제로 주사위(또는 룰렛)를 굴려서 보여준다. 소요 ms(배속 전) 반환 */
  private chanceFx(ev: Extract<GameEvent, { t: 'chanceRoll' }>): number {
    const sp = this.settings.speed;
    const host = this.view.querySelector('.table') ?? this.root;
    const box = document.createElement('div');
    box.className = 'chanceroll';
    const die = ev.kind === 'die';
    box.innerHTML = `<div class="crlabel">${ev.label}</div><div class="${die ? 'die bigdie crdie' : 'crball'}">${die ? pipsHtml(1) : '?'}</div><div class="crres"></div>`;
    host.appendChild(box);
    const face = box.querySelector<HTMLElement>(die ? '.crdie' : '.crball')!;
    const res = box.querySelector<HTMLElement>('.crres')!;
    // 감속하며 굴러가다 결과에서 멈춤
    const steps = die ? 9 : 11;
    let t = 0;
    for (let i = 0; i < steps; i++) {
      t += 38 * Math.pow(1.15, i);
      const last = i === steps - 1;
      setTimeout(() => {
        const v = last ? ev.result : die ? 1 + Math.floor(fxRandom() * 6) : Math.floor(fxRandom() * 37);
        if (die) { face.innerHTML = pipsHtml(v); face.style.transform = `rotate(${last ? 0 : (fxRandom() - 0.5) * 70}deg)`; }
        else { face.textContent = String(v); face.className = `crball ${v === 0 ? 'z' : v <= 18 ? 'w' : 'l'}`; }
        sfx.tick();
      }, t / sp);
    }
    setTimeout(() => {
      face.classList.add(ev.win ? 'crwin' : 'crlose');
      res.textContent = ev.win ? (die ? '6! 명중!' : '적중!') : ev.result === 0 && !die ? '잭팟 100%!' : '꽝...';
      res.className = `crres ${ev.win || (!die && ev.result === 0) ? 'win' : 'lose'}`;
      if (ev.win) { sfx.jackpot(); burstAt(face, '#ffd34d', 30); vibrate(60); } else sfx.bad();
    }, (t + 80) / sp);
    const total = t + 550;
    setTimeout(() => box.remove(), total / sp);
    return total;
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
      this.flash('gold');
      coinRain(50);
      this.confetti(90);
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
