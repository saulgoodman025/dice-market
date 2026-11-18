import type { App } from '../app';
import { SLOT_SYMBOLS, ROULETTE_BETS, HIGHROLLER, SCRATCH_SYMBOLS } from '../../data/casino';
import {
  evText, pct, rouletteOdds, slotOdds, ROULETTE_RED, type SlotResult, HIGHROLLER_P, highrollerTierBonus, scratchOdds, mysteryOdds,
} from '../../rules/casino';
import { advance, offerFaces } from '../../rules/run';
import { ddaHighrollerBonus } from '../../rules/dda';
import { RARITIES } from '../../core/state';
import { fxRandom } from '../../core/rng';
import { sfx } from '../../audio/sfx';
import { burstAt, vibrate } from '../fx/fx';
import { pipsHtml, esc } from '../components/parts';
import { topbar } from './common';
import { RELIC_BY_ID } from '../../data/relics';

const EMO = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.id, s.emoji]));

export function slotMachine(app: App): string {
  const s = app.ui.slot;
  const reels = s.res?.reels ?? ['seven', 'seven', 'seven'];
  return `<div class="slot">${reels.map((r, i) => `<div class="reel ${s.spinning ? 'spin' : ''}" id="reel${i}"><span>${s.spinning ? '❔' : EMO[r]}</span></div>`).join('')}</div>
  <div class="center" style="min-height:22px;font-weight:800" id="slotmsg">${s.res && !s.spinning ? (s.res.match ? `<span class="gold">${esc(s.res.text)}</span>` : '<span class="muted">꽝</span>') : ''}</div>`;
}

export function casinoScreen(app: App): string {
  const run = app.run!;
  const ui = app.ui;
  const tabs = `<div class="tabs">
    <button class="${ui.casinoTab === 'slot' ? 'on' : ''}" data-act="tab" data-arg="slot">🎰 슬롯</button>
    <button class="${ui.casinoTab === 'roulette' ? 'on' : ''}" data-act="tab" data-arg="roulette">🎡 룰렛</button>
    <button class="${ui.casinoTab === 'high' ? 'on' : ''}" data-act="tab" data-arg="high">🤵 하이롤러</button>
  </div>`;
  let body = '';
  if (ui.casinoTab === 'slot') {
    const o = slotOdds(run);
    const ticket = run.consumables.includes('freespin') ? ' (무료 스핀권 사용)' : '';
    body = `${slotMachine(app)}
      <div class="row center"><span class="odds">3개 일치 ${pct(o.rows.reduce((a, r) => a + r.three, 0))} · 2개 일치 ${pct(o.rows.reduce((a, r) => a + r.two, 0))} · ${evText(o.ev)}</span></div>
      <button class="btn primary big" data-act="spin" ${ui.slot.spinning ? 'disabled' : ''}>스핀 (칩 1)${ticket}</button>
      <button class="btn ghost" data-act="modal" data-arg="paytable">📋 배당표</button>`;
  } else if (ui.casinoTab === 'roulette') {
    const o = rouletteOdds(run);
    const r = ui.roulette;
    const totalBet = Object.values(ui.bets).reduce((a, b) => a + b, 0);
    const btn = (id: string, label: string, cls = '') => `<button class="${cls}" data-act="bet" data-arg="${id}">${label}${ui.bets[id] ? `<b>${ui.bets[id]}</b>` : ''}</button>`;
    const nums = Array.from({ length: 36 }, (_, i) => btn(`n${i + 1}`, String(i + 1), ROULETTE_RED.has(i + 1) ? 'red' : 'black')).join('');
    const ball = r.n === null ? '?' : String(r.n);
    const ballColor = r.n === null ? '#fff' : r.n === 0 ? '#3ddc84' : ROULETTE_RED.has(r.n) ? '#ff5a5f' : '#ddd';
    body = `<div class="wheel-wrap"><div class="wheel" id="wheel"></div><div class="wheel-ball" id="ball" style="color:${ballColor}">${r.spinning ? '…' : ball}</div></div>
      <div class="center small" style="min-height:18px">${r.n !== null && !r.spinning ? (r.won > 0 ? `<span class="gold">칩 +${r.won}</span>` : '<span class="muted">꽝</span>') : ''}</div>
      <div class="betgrid">${ROULETTE_BETS.map((b) => btn(b.id, `${b.label}<br><span class="small muted">×${b.payout} · ${pct(o.rows.find((x) => x.id === b.id)!.p)}</span>`, b.id === 'red' ? 'red' : b.id === 'black' ? 'black' : b.id === 'zero' ? 'zero' : '')).join('')}</div>
      <details><summary class="muted small">단일 숫자 (×36 · ${pct(o.single.p)} · ${evText(o.single.ev)})</summary><div class="betgrid" style="grid-template-columns:repeat(6,1fr);margin-top:6px">${nums}</div></details>
      <div class="row center"><span class="odds">빨강/검정·홀/짝 ${evText(o.rows[0].ev)} · 0 적중 시 칩 ×36 + 잭팟 100%</span></div>
      <div class="row"><button class="btn ghost" data-act="clearBets">베팅 취소</button><button class="btn primary grow" data-act="spinRoulette" ${totalBet ? '' : 'disabled'}>돌리기 (칩 ${totalBet})</button></div>`;
  } else {
    if (run.act < 2) body = `<div class="card center">🚫 하이롤러 테이블은 2막부터 열린다.<br><span class="muted small">(초반 판을 망치지 않도록)</span></div>`;
    else {
      const bonus = highrollerTierBonus(run, ddaHighrollerBonus(run));
      const h = ui.high;
      body = `<div class="card center">주사위 2개 합이 8 이상이면 승리 <span class="odds">확률 ${pct(HIGHROLLER_P)}</span></div>
        ${h.d ? `<div class="row center">${h.d.map((d) => `<div class="die">${pipsHtml(d)}</div>`).join('')}<b class="${h.win ? 'gold' : 'red'}">${h.d[0] + h.d[1]} — ${esc(h.text)}</b></div>` : ''}
        ${HIGHROLLER.map((o) => {
          const tier = RARITIES[Math.min(3, RARITIES.indexOf(o.prize) + bonus)];
          return `<button class="item" style="width:100%" data-act="high" data-arg="${o.id}">
            <div class="ic">${o.kind === 'maxHp' ? '💔' : '🩸'}</div>
            <div class="grow"><div class="tt">${esc(o.label)}</div><div class="ds">승리: ${{ common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' }[tier]} 유물${bonus > 0 ? ' (등급 보너스)' : ''} · 패배: ${o.kind === 'maxHp' ? `최대 체력 -${o.stake}` : `체력 -${o.stake}`}</div></div>
            <span class="odds">${pct(HIGHROLLER_P)}</span></button>`;
        }).join('')}`;
    }
  }
  return `${topbar(app)}<div class="screen">
    <h2 class="center">🎰 카지노 <span class="muted small">칩 ${run.chips}</span></h2>
    ${tabs}${body}
    <div class="grow"></div>
    <div class="muted small center">칩은 상점에서 8G에 살 수 있다. 판이 끝나면 칩은 소멸한다.</div>
    <button class="btn" data-act="leaveCasino" ${ui.slot.spinning || ui.roulette.spinning ? 'disabled' : ''}>카지노를 나간다 ▶</button>
  </div>`;
}

export function paytableModal(app: App): string {
  const o = slotOdds(app.run!);
  const rows = SLOT_SYMBOLS.map((s) => {
    const r = o.rows.find((x) => x.id === s.id)!;
    return `<tr><td style="font-size:20px">${s.emoji}</td><td>${pct(r.three)}<br><span class="small">${esc(s.three)}</span></td><td>${pct(r.two)}<br><span class="small">${esc(s.two)}</span></td></tr>`;
  }).join('');
  const sc = scratchOdds(app.run!).map((s) => `<tr><td>${s.emoji}×3+</td><td colspan="2">${pct(s.p)} · ${esc(s.reward)}</td></tr>`).join('');
  const mo = mysteryOdds();
  return `<div class="modal"><div class="box">
    <h3>📋 배당표 (실제 확률 그대로)</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr class="muted"><td></td><td>3개 일치</td><td>2개 일치</td></tr>${rows}
    </table>
    <div class="odds">슬롯 1회(칩 1 = 8G) ${evText(o.ev)} · 결과는 스핀 시작 시 확정</div>
    <h3>🎫 스크래치 카드</h3><table style="width:100%;font-size:12px">${sc}</table>
    <h3>🎁 미스터리 박스</h3><div class="small">일반 ${pct(mo.common)} · 희귀 ${pct(mo.rare)} · 영웅 ${pct(mo.epic)} · 전설 ${pct(mo.legendary)}</div>
    <button class="btn" data-act="closeModal">닫기</button>
  </div></div>`;
}

// ───────────── 애니메이션 ─────────────
export function animateSlot(app: App, res: SlotResult) {
  const ui = app.ui;
  ui.busy = true;
  ui.slot = { res, spinning: true };
  const pendingEvents = app.queue.splice(0);
  app.render();
  const sp = app.settings.speed;
  const reels = [0, 1, 2].map((i) => app.view.querySelector<HTMLElement>(`#reel${i}`));
  const ivs = reels.map((el) => window.setInterval(() => {
    if (el) el.firstElementChild!.textContent = SLOT_SYMBOLS[Math.floor(fxRandom() * SLOT_SYMBOLS.length)].emoji;
  }, 60));
  const tense = res.reels[0] === res.reels[1];
  const stops = [700, 1100, tense ? 2300 : 1500].map((t) => t / sp);
  if (tense) setTimeout(() => reels[2]?.classList.add('tense'), stops[1]);
  stops.forEach((t, i) => setTimeout(() => {
    clearInterval(ivs[i]);
    const el = reels[i];
    if (el) { el.classList.remove('spin', 'tense'); el.firstElementChild!.textContent = EMO[res.reels[i]]; }
    sfx.reelStop();
  }, t));
  setTimeout(() => {
    ui.slot = { res, spinning: false };
    ui.busy = false;
    app.queue.unshift(...pendingEvents);
    if (res.match === 3) { sfx.jackpot(); vibrate([60, 40, 60]); }
    else if (res.match === 2) sfx.coin();
    else sfx.bad();
    const run = app.run!;
    if (res.faceChoice) offerFaces(app.ctx, run.screen);
    if (res.elite) {
      run.pendingEliteFromSlot = true;
      app.toast('💀 해골 3개! 엘리트가 습격한다 (보상 2배)', 'bad');
      if (run.screen === 'casino') {
        app.after();
        setTimeout(() => { ui.slot = { res: null, spinning: false }; advance(app.ctx); app.after(); }, 1400 / sp);
        return;
      }
    }
    app.after();
    if (res.match) burstAt(app.view.querySelector('.slot'), '#ffd34d', res.match === 3 ? 40 : 14);
  }, stops[2] + 150);
}

export function animateRoulette(app: App, n: number, won: number) {
  const ui = app.ui;
  ui.busy = true;
  ui.roulette = { n, won, spinning: true };
  const ev = app.queue.splice(0);
  app.render();
  const sp = app.settings.speed;
  const wheel = app.view.querySelector<HTMLElement>('#wheel');
  if (wheel) {
    wheel.style.transitionDuration = `${2.2 / sp}s`;
    requestAnimationFrame(() => { wheel.style.transform = `rotate(${1440 + Math.floor(fxRandom() * 360)}deg)`; });
  }
  const ball = app.view.querySelector<HTMLElement>('#ball');
  const iv = window.setInterval(() => { if (ball) ball.textContent = String(Math.floor(fxRandom() * 37)); sfx.tick(); }, 90);
  setTimeout(() => {
    clearInterval(iv);
    ui.roulette = { n, won, spinning: false };
    ui.bets = {};
    ui.busy = false;
    app.queue.unshift(...ev);
    if (won > 0) sfx.jackpot(); else sfx.bad();
    app.after();
  }, 2300 / sp);
}

export function animateDon(app: App, frames: number[], win: boolean) {
  const ui = app.ui;
  ui.busy = true;
  ui.don = { rolling: true, face: frames[0], text: '' };
  app.render();
  const sp = app.settings.speed;
  const el = app.view.querySelector<HTMLElement>('#dondie');
  // 감속: 프레임 간격이 점점 길어진다 (실제 굴림 시퀀스를 그대로 재생)
  let t = 0;
  frames.forEach((f, i) => {
    t += (55 * Math.pow(1.16, i)) / sp;
    setTimeout(() => {
      if (el) { el.innerHTML = pipsHtml(f); el.style.transform = `rotate(${(i % 2 ? 1 : -1) * (frames.length - i) * 3}deg)`; }
      sfx.tick();
    }, t);
  });
  setTimeout(() => {
    ui.don = { rolling: false, face: frames[frames.length - 1], text: win ? '성공! 2배!' : '실패...' };
    ui.busy = false;
    if (win) { sfx.jackpot(); vibrate(50); } else sfx.lose();
    app.after();
    if (win) burstAt(app.view.querySelector('#dondie'), '#ffd34d', 30);
  }, t + 350 / sp);
}

export function scratchModal(app: App): string {
  const s = app.ui.scratch;
  if (!s) return '';
  const cols = s.grid.length / 3;
  const emo = Object.fromEntries(SCRATCH_SYMBOLS.map((x) => [x.id, x.emoji]));
  const all = s.rev.every(Boolean);
  const odds = scratchOdds(app.run!).map((o) => `${o.emoji} ${pct(o.p)}`).join(' · ');
  return `<div class="modal"><div class="box center">
    <h3>🎫 스크래치 카드</h3>
    <div class="odds">같은 심볼 3개 이상: ${odds}</div>
    <div class="scratch" style="grid-template-columns:repeat(${cols},64px)">${s.grid.map((g, i) => `<div class="${s.rev[i] ? 'rev' : ''} ${all && s.wins.includes(g) ? 'win' : ''}" data-act="scratchCell" data-arg="${i}">${emo[g]}</div>`).join('')}</div>
    <div style="min-height:20px">${all ? (s.wins.length ? `<b class="gold">당첨: ${s.wins.map((w) => SCRATCH_SYMBOLS.find((x) => x.id === w)!.reward).join(', ')}</b>` : '<span class="muted">꽝</span>') : '<span class="muted small">칸을 탭해서 긁자</span>'}</div>
    ${all ? '<button class="btn primary" data-act="closeModal">확인</button>' : '<button class="btn" data-act="scratchAll">전부 긁기</button>'}
  </div></div>`;
}

export function mysteryModal(app: App): string {
  const m = app.ui.mystery;
  if (!m) return '';
  const lvl = RARITIES.indexOf(m.rarity as (typeof RARITIES)[number]) + 1;
  const mo = mysteryOdds();
  const relic = m.relic ? RELIC_BY_ID[m.relic] : null;
  return `<div class="modal"><div class="box center">
    <h3>🎁 미스터리 박스</h3>
    <div class="odds">일반 ${pct(mo.common)} · 희귀 ${pct(mo.rare)} · 영웅 ${pct(mo.epic)} · 전설 ${pct(mo.legendary)}</div>
    <div class="muted small">흔들림이 셀수록 좋은 것이 들었다 (실제 내용물과 일치)</div>
    ${m.opened ? `<div style="font-size:60px">${relic?.emoji ?? '💨'}</div><b>${relic ? esc(relic.name) : '빈 상자'}</b><div class="small">${relic ? esc(relic.desc) : ''}</div><button class="btn primary" data-act="closeModal">확인</button>`
      : `<div class="mbox s${lvl}" data-act="mysteryOpen">🎁</div><button class="btn primary" data-act="mysteryOpen">열기</button>`}
  </div></div>`;
}
