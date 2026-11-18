// 첫 전투 단계별 튜토리얼
// - 단계마다 설명할 부분만 밝게 비추고 나머지는 어둡게 덮어 조작을 막는다
// - 직접 해봐야 하는 단계는 해당 행동(그 카드만)을 했을 때 다음으로 넘어간다
// - 말풍선은 비춘 부분을 가리지 않는 가장 넓은 빈 공간에 놓인다
// - 튜토리얼 동안 적·나는 쓰러지지 않는다 (run.flags.tutorial) → 끝까지 볼 수 있다
import type { App } from './app';
import { SKILL_BY_ID } from '../data/skills';
import { baseRerolls, skillUsable } from '../rules/combat';

interface Step {
  focus: (app: App) => string[]; // 밝게 비출 요소 (이 요소만 조작 가능)
  title: string;
  text: string;
  done?: (app: App) => boolean; // 이 조건이 되면 자동으로 다음 단계
  doLabel?: string;
}

const cb = (app: App) => app.run?.combat ?? null;

/** 튜토리얼에서 쓰게 할 카드 (공격: 적 대상 카드 / 방어: 방어 카드) */
export function tutorialCard(app: App, kind: 'atk' | 'def'): number {
  const run = app.run!;
  const ctx = app.ctx;
  const match = (i: number) => {
    const d = SKILL_BY_ID[run.skills[i].id];
    return kind === 'atk' ? d.target === 'enemy' && d.role === 'atk' && !d.chance : d.role === 'def' && !d.perCombat;
  };
  const idx = run.skills.map((_, i) => i).filter(match);
  return idx.find((i) => skillUsable(ctx, i)) ?? idx[0] ?? -1;
}

const card = (app: App, kind: 'atk' | 'def') => `.scard[data-card="${tutorialCard(app, kind)}"]`;
const usedKind = (app: App, kind: 'atk' | 'def') => {
  const c = cb(app);
  return !!c && app.run!.skills.some((s, i) => c.usedSlots[i] && (kind === 'atk' ? SKILL_BY_ID[s.id].target === 'enemy' : SKILL_BY_ID[s.id].role === 'def'));
};

export const COACH: Step[] = [
  { focus: () => ['.enemy:not(.dead)'], title: '① 적과 다음 행동', text: '위쪽이 적이다. 머리 위 ⚔ 숫자만큼, 내 턴이 끝나면 공격해 온다. "🎯약점" 눈이 들어간 주사위로 때리면 피해 1.75배!' },
  { focus: () => ['.tray'], title: '② 주사위', text: '매 턴 주사위가 굴러간다. 이 주사위로 아래 카드를 쓴다.' },
  {
    focus: () => ['.tray'], title: '③ 잠그기', text: '마음에 드는 주사위를 탭해 🔒 잠가 보자. 잠근 주사위는 다시 굴려도 그대로 남는다. 한 번에 2개까지!',
    doLabel: '주사위 하나를 탭하세요', done: (a) => !!cb(a)?.hand.some((h) => h.locked && !h.used) || (cb(a)?.phase ?? 'roll') !== 'roll',
  },
  {
    focus: () => ['[data-act="reroll"]', '.tray'], title: '④ 다시 굴리기', text: '🎲 리롤을 누르면 잠그지 않은 주사위만 다시 굴린다. 한 턴에 2번까지.',
    doLabel: '리롤을 누르세요', done: (a) => { const c = cb(a); return !!c && (c.phase !== 'roll' || c.rerollsLeft < baseRerolls(a.ctx)); },
  },
  { focus: () => ['.handbar'], title: '⑤ 족보 = 배율', text: '같은 눈·이어지는 눈을 모으면 족보! 배율(×)만큼 이번 턴의 공격·방어가 모두 세진다.' },
  { focus: () => ['.chipstat', '.handbar'], title: '⑥ 족보 칩 🔶', text: '족보가 좋을수록 🔶 칩을 더 받는다. 카드 왼쪽 위 숫자가 비용. 남은 칩은 3개까지 다음 턴으로 넘어간다.' },
  {
    focus: (a) => [card(a, 'atk'), '.enemy:not(.dead)'], title: '⑦ 공격 카드', text: '빛나는 🎯 카드를 끌어서 적 위에 놓아 보자. 카드 오른쪽 위 숫자가 예상 피해다.',
    doLabel: '카드를 적에게 끌어다 놓으세요', done: (a) => usedKind(a, 'atk'),
  },
  {
    focus: (a) => [card(a, 'def')], title: '⑧ 방어 카드', text: '✋ 표시 카드는 대상이 없다. 위쪽으로 끌어올려 놓으면 쓴다(또는 카드를 탭한 뒤 위쪽을 탭). 🛡 방어도가 적의 공격을 먼저 막는다.',
    doLabel: '방어 카드를 테이블로 끌어올리세요', done: (a) => usedKind(a, 'def'),
  },
  { focus: () => ['.tablestats'], title: '⑨ 저금통', text: '쓰지 않고 남긴 주사위의 눈은 🐷 저금통에 쌓여, 전투가 끝나면 골드가 된다.' },
  {
    focus: () => ['[data-act="endTurn"]'], title: '⑩ 턴 종료', text: '할 일을 마쳤으면 턴 종료! 더 할 게 없으면 이 버튼이 반짝인다.',
    doLabel: '턴 종료를 누르세요', done: (a) => (cb(a)?.turn ?? 1) >= 2,
  },
  { focus: () => ['.player'], title: '⑪ 잘했다!', text: '적의 공격은 🛡 방어도가 먼저 막고, 남은 만큼 ❤ 체력이 준다. 이제 혼자 싸워 보자! (오른쪽 위 ? 로 다시 보기)' },
];

/** 지금 튜토리얼이 조작을 막고 있는가 */
export function coachActive(app: App): boolean {
  return !!app.run?.combat && app.ui.tut > 0 && app.ui.tut <= COACH.length;
}

/** 렌더 직후 호출 */
export function drawCoach(app: App) {
  const ui = app.ui;
  if (!coachActive(app)) return;
  if (ui.modal || app.run!.pending || app.run!.offer || ui.picker || app.veil) return;
  let step = COACH[ui.tut - 1];
  while (step?.done?.(app) && ui.tut < COACH.length) {
    ui.tut++;
    step = COACH[ui.tut - 1];
  }
  const targets = step.focus(app).flatMap((sel) => [...app.view.querySelectorAll<HTMLElement>(sel)]);
  if (!targets.length) return;
  // 어둡게 덮고(조작 차단), 설명할 부분만 위로 올린다
  const dim = document.createElement('div');
  dim.className = 'coach-dim';
  dim.dataset.act = 'field'; // 대상 없는 카드를 고른 상태에서 위쪽을 탭하면 사용
  app.view.appendChild(dim);
  targets.forEach((t) => t.classList.add('coach-focus'));

  const last = ui.tut === COACH.length;
  const bubble = document.createElement('div');
  bubble.className = 'coach';
  bubble.innerHTML = `<div class="ctitle">${step.title}</div><div class="ctext">${step.text}</div>
    ${step.done && !last ? `<div class="cdo">👉 ${step.doLabel}</div>` : ''}
    <div class="cbtns"><button class="btn ghost" data-act="tutSkip" data-always="1">튜토리얼 끄기</button>
    ${step.done && !last ? '' : `<button class="btn primary" data-act="tutNext" data-always="1">${last ? '시작!' : '다음 ▶'}</button>`}</div>
    <div class="cprog">${COACH.map((_, i) => `<i class="${i < ui.tut ? 'on' : ''}"></i>`).join('')}</div>`;
  app.view.appendChild(bubble);
  placeBubble(app, bubble, targets);
}

/** 비춘 부분과 겹치지 않는 가장 넓은 세로 빈 공간에 말풍선을 둔다 */
function placeBubble(app: App, bubble: HTMLElement, targets: HTMLElement[]) {
  const v = app.view.getBoundingClientRect();
  const rects = targets.map((t) => t.getBoundingClientRect()).map((r) => ({ top: r.top - v.top, bottom: r.bottom - v.top })).sort((a, b) => a.top - b.top);
  // 겹치는 영역 합치기
  const merged: { top: number; bottom: number }[] = [];
  for (const r of rects) {
    const m = merged[merged.length - 1];
    if (m && r.top <= m.bottom + 4) m.bottom = Math.max(m.bottom, r.bottom);
    else merged.push({ ...r });
  }
  const gaps: { top: number; bottom: number }[] = [];
  let y = 46; // 상단 바 아래부터
  for (const m of merged) { gaps.push({ top: y, bottom: m.top }); y = m.bottom; }
  gaps.push({ top: y, bottom: v.height - 4 });
  const best = gaps.sort((a, b) => (b.bottom - b.top) - (a.bottom - a.top))[0];
  const h = bubble.offsetHeight;
  const room = best.bottom - best.top;
  const top = room >= h + 12 ? best.top + (room - h) / 2 : Math.max(4, Math.min(v.height - h - 4, best.top + 6));
  bubble.style.top = `${top}px`;
}
