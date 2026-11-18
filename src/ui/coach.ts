// 첫 전투 단계별 튜토리얼
// - 단계마다 설명할 부분만 밝게 비추고 나머지는 어둡게 덮어 조작을 막는다
// - 직접 해봐야 하는 단계는 해당 행동(그 카드만)을 했을 때 다음으로 넘어간다
// - 말풍선은 비춘 부분을 가리지 않는 가장 넓은 빈 공간에 놓인다
// - 튜토리얼 동안 적·나는 쓰러지지 않는다 (run.flags.tutorial) → 끝까지 볼 수 있다
import type { App } from './app';
import { resolveFor } from '../rules/cardfx';
import { CARD_BY_ID } from '../data/cards';
import type { RunState } from '../core/state';
import { baseRerolls, cardUsable } from '../rules/combat';

interface Step {
  focus: (app: App) => string[]; // 밝게 비출 요소 (이 요소만 조작 가능)
  title: string;
  text: string;
  done?: (app: App) => boolean; // 이 조건이 되면 자동으로 다음 단계
  doLabel?: string;
}

const cb = (app: App) => app.run?.combat ?? null;

/** 첫 전투 손패에 공격(베기)·방어(방패) 카드가 꼭 있게 한다 (설명할 카드가 없으면 안 되므로) */
export function tutorialHand(run: RunState) {
  const c = run.combat;
  if (!c) return;
  const want = [{ role: 'atk', target: true }, { role: 'def', target: false }];
  for (const w of want) {
    const ok = (id: string) => { const d = CARD_BY_ID[id]; return d.role === w.role && !!d.target === w.target && !d.chance && !d.perCombat && d.rarity === 'basic'; };
    if (c.cards.some((x) => ok(x.id))) continue;
    const i = c.drawPile.findIndex((x) => ok(x.id));
    const j = c.cards.findIndex((x) => CARD_BY_ID[x.id].rarity !== 'basic');
    if (i >= 0) { const [card] = c.drawPile.splice(i, 1); const out = c.cards.splice(j >= 0 ? j : c.cards.length - 1, 1, card); c.drawPile.push(...out); }
  }
}

/** 튜토리얼에서 쓰게 할 카드 (공격: 적 대상 카드 / 방어: 방어 카드) */
export function tutorialCard(app: App, kind: 'atk' | 'def'): number {
  const run = app.run!;
  const ctx = app.ctx;
  const cards = run.combat?.cards ?? [];
  const match = (i: number) => {
    const d = resolveFor(run, cards[i]);
    return kind === 'atk' ? d.target === 'enemy' && d.role === 'atk' && !d.chance : d.role === 'def' && !d.perCombat;
  };
  const idx = cards.map((_, i) => i).filter(match);
  return idx.find((i) => cardUsable(ctx, i)) ?? idx[0] ?? -1;
}

const card = (app: App, kind: 'atk' | 'def') => `.scard[data-card="${tutorialCard(app, kind)}"]`;
const usedKind = (app: App, kind: 'atk' | 'def') => {
  const c = cb(app);
  if (!c) return false;
  return [...c.discard, ...c.exhausted].some((x) => { const d = resolveFor(app.run!, x); return kind === 'atk' ? d.target === 'enemy' : d.role === 'def'; });
};

export const COACH: Step[] = [
  { focus: () => ['.enemy:not(.dead)'], title: '① 적과 다음 행동', text: '위쪽이 적입니다. 머리 위 ⚔ 숫자만큼 내 턴이 끝나면 공격해 옵니다. 🎯약점 숫자와 같은 눈으로 때리면 피해가 1.75배!' },
  { focus: () => ['.tray'], title: '② 주사위', text: '매 턴 주사위가 굴러갑니다. 이 주사위를 아래 카드에 써서 공격하고 방어합니다.' },
  {
    focus: () => ['.tray'], title: '③ 잠그기', text: '좋은 눈은 탭해서 🔒 잠그세요. 잠근 주사위는 다시 굴려도 그대로 남습니다. 한 번에 2개까지 잠글 수 있습니다.',
    doLabel: '주사위 하나를 탭하세요', done: (a) => !!cb(a)?.hand.some((h) => h.locked && !h.used) || (cb(a)?.phase ?? 'roll') !== 'roll',
  },
  {
    focus: () => ['[data-act="reroll"]', '.tray'], title: '④ 다시 굴리기', text: '🎲 리롤을 누르면 잠그지 않은 주사위만 다시 굴립니다. 한 턴에 2번까지 할 수 있습니다.',
    doLabel: '리롤을 누르세요', done: (a) => { const c = cb(a); return !!c && (c.phase !== 'roll' || c.rerollsLeft < baseRerolls(a.ctx)); },
  },
  { focus: () => ['.handbar'], title: '⑤ 족보 = 배율', text: '같은 눈이나 이어지는 눈을 모으면 족보가 됩니다. 이번 턴 모든 공격과 방어에 ×배율이 곱해집니다. 누르면 족보표를 볼 수 있습니다.' },
  { focus: () => ['.chipstat', '.handbar'], title: '⑥ 족보 칩 🔶', text: '카드를 쓰려면 🔶 칩이 필요합니다(카드 왼쪽 위 숫자). 족보가 좋을수록 칩을 많이 받고, 남은 칩은 3개까지 다음 턴으로 넘어갑니다.' },
  {
    focus: (a) => [card(a, 'atk'), '.enemy:not(.dead)'], title: '⑦ 공격 카드', text: '빛나는 🎯 카드를 적에게 끌어다 놓으세요. 카드 오른쪽 위 숫자가 예상 피해입니다. (카드를 탭한 뒤 적을 탭해도 됩니다)',
    doLabel: '카드를 적에게 끌어다 놓으세요', done: (a) => usedKind(a, 'atk'),
  },
  {
    focus: (a) => [card(a, 'def')], title: '⑧ 방어 카드', text: '✋ 카드는 대상이 없습니다. 위쪽으로 끌어올려 놓으면 씁니다. 얻은 🛡 방어도는 적의 공격을 먼저 막아줍니다.',
    doLabel: '방어 카드를 테이블로 끌어올리세요', done: (a) => usedKind(a, 'def'),
  },
  { focus: () => ['.piles', '.hand'], title: '⑨ 카드 뽑기', text: '매 턴 덱에서 카드 5장을 뽑고, 턴이 끝나면 손패는 모두 버립니다. 🂠 뽑을 카드가 떨어지면 🗑 버린 카드를 섞어 다시 씁니다. 족보가 투 페어 이상이면 1장 더!' },
  { focus: () => ['.tablestats'], title: '⑩ 주사위 태우기 🔥', text: '턴마다 1번, 쓰지 않을 주사위 하나를 태워 카드 1장을 더 뽑을 수 있습니다. 태운 주사위는 저금통에 들어가지 않습니다.' },
  { focus: () => ['.tablestats'], title: '⑪ 저금통', text: '쓰지 않고 남긴 주사위의 눈은 🐷 저금통에 쌓입니다. 전투에서 이기면 골드로 바뀝니다.' },
  {
    focus: () => ['[data-act="endTurn"]'], title: '⑫ 턴 종료', text: '할 일을 마쳤으면 턴을 끝내세요. 더 할 수 있는 게 없으면 이 버튼이 반짝입니다.',
    doLabel: '턴 종료를 누르세요', done: (a) => (cb(a)?.turn ?? 1) >= 2,
  },
  { focus: () => ['.player'], title: '⑬ 잘했다!', text: '적의 공격은 🛡 방어도가 먼저 막고, 남은 만큼 ❤ 체력이 줄어듭니다. 이제 직접 싸워 보세요! 오른쪽 위 ? 로 다시 볼 수 있습니다.' },
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
    <div class="cbtns">${app.run!.flags.tutorial ? '<span></span>' : '<button class="btn ghost" data-act="tutSkip" data-always="1">닫기</button>'}
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
