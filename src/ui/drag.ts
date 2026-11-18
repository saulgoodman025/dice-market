// 스킬 카드 끌어다 놓기 (마우스·터치 공통)
// 🎯 공격 카드: 적 위에 놓으면 그 적에게 사용 (적이 하나뿐이면 테이블 어디든)
// ✋ 대상 없는 카드: 손패 위쪽 아무 곳에나 놓으면 사용
import type { App } from './app';
import { SKILL_BY_ID } from '../data/skills';
import { cardPlayable, playSkill } from './actions';
import { sfx } from '../audio/sfx';

interface DragState {
  slot: number;
  x0: number;
  y0: number;
  card: HTMLElement;
  ghost: HTMLElement | null;
  enemyTarget: boolean;
  hoverUid: number | null;
  armed: boolean;
}

const DRAG_START = 8; // px

export function initCardDrag(app: App) {
  const root = app.root;
  let st: DragState | null = null;

  const cleanup = () => {
    root.classList.remove('dragging', 'drag-enemy', 'drag-field');
    root.querySelectorAll('.enemy.aim').forEach((e) => e.classList.remove('aim'));
    st?.card.classList.remove('lifted');
  };

  root.addEventListener('pointerdown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.scard');
    if (!card || app.ui.busy || e.button > 0) return;
    const slot = Number(card.dataset.card);
    const def = SKILL_BY_ID[app.run?.skills[slot]?.id ?? ''];
    if (!def) return;
    st = { slot, x0: e.clientX, y0: e.clientY, card, ghost: null, enemyTarget: def.target === 'enemy', hoverUid: null, armed: false };
  });

  window.addEventListener('pointermove', (e) => {
    if (!st) return;
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.ghost) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      app.cancelTip();
      if (!cardPlayable(app, st.slot, true)) { st = null; return; }
      // 드래그 시작: 카드 복제본이 손가락을 따라온다
      const g = st.card.cloneNode(true) as HTMLElement;
      g.classList.add('ghost', st.enemyTarget ? 'aimmode' : 'fieldmode');
      g.removeAttribute('data-card');
      root.appendChild(g);
      st.ghost = g;
      st.card.classList.add('lifted');
      root.classList.add('dragging', st.enemyTarget ? 'drag-enemy' : 'drag-field');
      sfx.click();
    }
    const h = root.getBoundingClientRect();
    st.ghost.style.left = `${e.clientX - h.left}px`;
    st.ghost.style.top = `${e.clientY - h.top}px`;
    // 놓을 곳 판정
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const enemyEl = under?.closest<HTMLElement>('.enemy:not(.dead)') ?? null;
    const handTop = root.querySelector('.hand')?.getBoundingClientRect().top ?? h.bottom;
    const inField = e.clientY < handTop - 10;
    root.querySelectorAll('.enemy.aim').forEach((x) => { if (x !== enemyEl) x.classList.remove('aim'); });
    if (st.enemyTarget) {
      const alive = [...root.querySelectorAll<HTMLElement>('.enemy:not(.dead)')];
      const auto = alive.length === 1 && inField ? alive[0] : null;
      const tgt = enemyEl ?? auto;
      st.hoverUid = tgt ? Number(tgt.dataset.uid) : null;
      if (tgt && !tgt.classList.contains('aim')) { tgt.classList.add('aim'); sfx.tick(); }
      st.armed = st.hoverUid !== null;
    } else {
      st.armed = inField;
    }
    st.ghost.classList.toggle('armed', st.armed);
  });

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!st) return;
    const s = st;
    st = null;
    if (!s.ghost) return; // 드래그가 아니었으면 탭(클릭)으로 처리된다
    app.swallowClick();
    const g = s.ghost;
    cleanup();
    if (!cancelled && s.armed) {
      g.classList.add('played');
      setTimeout(() => g.remove(), 220);
      playSkill(app, s.slot, s.enemyTarget ? s.hoverUid : null);
    } else {
      // 제자리로 돌아간다
      const r = s.card.getBoundingClientRect();
      const h = root.getBoundingClientRect();
      g.classList.add('returning');
      g.style.left = `${r.left - h.left + r.width / 2}px`;
      g.style.top = `${r.top - h.top + r.height / 2}px`;
      setTimeout(() => g.remove(), 200);
      if (!cancelled) app.toast(s.enemyTarget ? '🎯 적 위에 놓아야 한다' : '✋ 테이블 위로 끌어올려 놓자', 'info');
    }
    void e;
  };
  window.addEventListener('pointerup', (e) => finish(e, false));
  window.addEventListener('pointercancel', (e) => finish(e, true));
}
