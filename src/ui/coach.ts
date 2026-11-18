// 첫 전투 단계별 튜토리얼: 화면의 해당 부분을 비추고, 직접 해보면 다음 단계로 넘어간다
import type { App } from './app';
import { SKILL_BY_ID } from '../data/skills';
import { baseRerolls } from '../rules/combat';

interface Step {
  sel: string; // 비출 요소
  title: string;
  text: string;
  /** 이 조건이 되면 자동으로 다음 단계 (없으면 '다음' 버튼) */
  done?: (app: App) => boolean;
  doLabel?: string; // 해야 할 행동 안내
}

const cb = (app: App) => app.run?.combat ?? null;

export const COACH: Step[] = [
  { sel: '.enemy:not(.dead)', title: '① 적과 다음 행동', text: '위쪽이 적이다. 머리 위 ⚔ 숫자만큼, 내 턴이 끝나면 공격해 온다. 아래 "약점" 눈이 들어간 주사위로 때리면 피해가 1.75배!' },
  { sel: '.tray', title: '② 주사위', text: '매 턴 주사위가 굴러간다. 이 주사위로 아래 카드를 쓴다.' },
  {
    sel: '.tray', title: '③ 잠그기', text: '마음에 드는 주사위 하나를 탭해 🔒 잠가 보자. 잠근 주사위는 다시 굴려도 그대로 남는다. 한 번에 2개까지만 잠글 수 있으니 신중하게!',
    doLabel: '주사위 하나를 탭해 보세요', done: (a) => !!cb(a)?.hand.some((h) => h.locked && !h.used) || (cb(a)?.phase ?? 'roll') !== 'roll',
  },
  {
    sel: '[data-act="reroll"]', title: '④ 다시 굴리기', text: '🎲 리롤을 누르면 잠그지 않은 주사위만 다시 굴린다. 한 턴에 2번까지.',
    doLabel: '리롤을 눌러 보세요', done: (a) => { const c = cb(a); return !!c && (c.phase !== 'roll' || c.rerollsLeft < baseRerolls(a.ctx)); },
  },
  { sel: '.handbar', title: '⑤ 족보 = 배율', text: '같은 눈·이어지는 눈을 모으면 족보! 배율만큼 이번 턴의 공격·방어가 모두 세진다. 누르면 족보표가 나온다.' },
  { sel: '.chipstat', title: '⑥ 족보 칩 🔶', text: '족보가 좋을수록 🔶 칩을 더 받는다. 카드 왼쪽 위 숫자가 그 카드의 칩 비용. 남은 칩은 3개까지 다음 턴으로 넘어간다.' },
  {
    sel: '.hand', title: '⑦ 공격 카드', text: '🎯 표시 카드를 끌어서 적 위에 놓아 보자. 카드 오른쪽 위 숫자가 예상 피해다. (카드를 탭한 뒤 적을 탭해도 된다)',
    doLabel: '공격 카드를 적에게 끌어다 놓아 보세요',
    done: (a) => { const c = cb(a); return !!c && a.run!.skills.some((s, i) => c.usedSlots[i] && SKILL_BY_ID[s.id].target === 'enemy'); },
  },
  { sel: '.hand', title: '⑧ 방어 카드', text: '✋ 표시 카드(방패 등)는 테이블 아무 곳에 끌어다 놓으면 쓴다. 적의 공격을 🛡 방어도로 막아 준다.' },
  { sel: '.tablestats', title: '⑨ 저금통', text: '쓰지 않고 남긴 주사위의 눈은 🐷 저금통에 쌓여, 전투가 끝나면 골드가 된다.' },
  {
    sel: '[data-act="endTurn"]', title: '⑩ 턴 종료', text: '할 일을 마쳤으면 턴 종료! 더 할 수 있는 게 없으면 이 버튼이 반짝인다.',
    doLabel: '턴 종료를 눌러 보세요', done: (a) => (cb(a)?.turn ?? 1) >= 2,
  },
  { sel: '.player', title: '⑪ 잘했다!', text: '적의 공격은 🛡 방어도가 먼저 막고, 남은 만큼 ❤ 체력이 준다. 이제 혼자 싸워 보자! (오른쪽 위 ? 로 다시 볼 수 있다)' },
];

/** 렌더 직후 호출: 현재 단계의 대상 요소를 비추고 말풍선을 붙인다 */
export function drawCoach(app: App) {
  const ui = app.ui;
  if (!app.run?.combat || ui.tut <= 0 || ui.tut > COACH.length) return;
  if (ui.modal || app.run.pending || app.run.offer || ui.picker) return;
  // 이미 해낸 단계는 넘긴다
  let step = COACH[ui.tut - 1];
  while (step?.done?.(app) && ui.tut < COACH.length) {
    ui.tut++;
    step = COACH[ui.tut - 1];
  }
  const target = app.view.querySelector<HTMLElement>(step.sel);
  if (!target) return;
  target.classList.add('coach-focus');
  const last = ui.tut === COACH.length;
  const bubble = document.createElement('div');
  bubble.className = 'coach';
  bubble.innerHTML = `<div class="ctitle">${step.title}</div><div class="ctext">${step.text}</div>
    ${step.done && !last ? `<div class="cdo">👉 ${step.doLabel}</div>` : ''}
    <div class="cbtns"><button class="btn ghost" data-act="tutSkip" data-always="1">튜토리얼 끄기</button>
    ${step.done && !last ? '<button class="btn ghost" data-act="tutNext" data-always="1">넘기기</button>' : `<button class="btn primary" data-act="tutNext" data-always="1">${last ? '시작!' : '다음 ▶'}</button>`}</div>
    <div class="cprog">${COACH.map((_, i) => `<i class="${i < ui.tut ? 'on' : ''}"></i>`).join('')}</div>`;
  app.view.appendChild(bubble);
  // 대상이 화면 아래쪽이면 말풍선을 위에, 위쪽이면 아래에
  const v = app.view.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const below = r.top + r.height / 2 < v.top + v.height * 0.45;
  if (below) bubble.style.top = `${Math.min(v.height - bubble.offsetHeight - 8, r.bottom - v.top + 10)}px`;
  else bubble.style.top = `${Math.max(8, r.top - v.top - bubble.offsetHeight - 10)}px`;
  bubble.classList.add(below ? 'below' : 'above');
}
