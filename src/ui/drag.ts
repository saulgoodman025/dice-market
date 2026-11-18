// 스킬 카드 끌어다 놓기 (마우스·터치 공통)
// 카드는 손패에서 위로 들리고, 카드에서 손가락(마우스)까지 붉은 점선 화살표가 이어진다.
// 🎯 공격 카드: 적 위에 놓으면 그 적에게 사용 (적이 하나뿐이면 테이블 어디든)
// ✋ 대상 없는 카드: 손패 위쪽 아무 곳에나 놓으면 사용
import type { App } from './app';
import { resolveFor } from '../rules/cardfx';
import { cardPlayable, playSkill } from './actions';

interface DragState {
  slot: number;
  x0: number;
  y0: number;
  card: HTMLElement;
  arrow: SVGSVGElement | null;
  ghost: HTMLElement | null;
  enemyTarget: boolean;
  hoverUid: number | null;
  lastUid: number | null;
  armed: boolean;
}

const DRAG_START = 8; // px
const SVGNS = 'http://www.w3.org/2000/svg';

function makeArrow(root: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'dragarrow');
  svg.innerHTML = `<defs><marker id="ahead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ff4d4d"/></marker></defs>
    <path class="ashadow" d="" /><path class="aline" d="" marker-end="url(#ahead)" />`;
  root.appendChild(svg);
  return svg;
}

function drawArrow(svg: SVGSVGElement, root: HTMLElement, card: HTMLElement, x: number, y: number) {
  const h = root.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const sx = c.left + c.width / 2 - h.left;
  const sy = c.top - h.top + 6;
  const ex = x - h.left;
  const ey = y - h.top;
  // 위로 휘는 곡선 (하스스톤 식)
  const cx = (sx + ex) / 2 + (ex - sx) * 0.1;
  const cy = Math.min(sy, ey) - Math.max(40, Math.abs(ex - sx) * 0.35);
  const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
  svg.querySelectorAll('path.aline, path.ashadow').forEach((p) => p.setAttribute('d', d));
}

export function initCardDrag(app: App) {
  const root = app.root;
  let st: DragState | null = null;

  const cleanup = (s: DragState) => {
    app.clearHitPreview();
    root.classList.remove('dragging', 'drag-enemy', 'drag-field');
    root.querySelectorAll('.enemy.aim').forEach((e) => e.classList.remove('aim'));
    s.card.classList.remove('aiming', 'lifted');
    s.arrow?.remove();
    s.ghost?.remove();
  };

  root.addEventListener('pointerdown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.scard');
    if (!card || app.ui.busy || e.button > 0) return;
    const slot = Number(card.dataset.card);
    const inst = app.run?.combat?.cards[slot];
    if (!inst || !app.run) return;
    const def = resolveFor(app.run, inst);
    st = { slot, x0: e.clientX, y0: e.clientY, card, arrow: null, ghost: null, lastUid: null, enemyTarget: def.target === 'enemy', hoverUid: null, armed: false };
  });

  window.addEventListener('pointermove', (e) => {
    if (!st) return;
    if (!st.arrow && !st.ghost) {
      if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < DRAG_START) return;
      app.cancelTip();
      if (!cardPlayable(app, st.slot, true)) { st = null; return; }
      if (st.enemyTarget) {
        st.arrow = makeArrow(root);
        st.card.classList.add('aiming');
      } else {
        // 대상 없는 카드: 화살표 없이 카드 복제본이 손가락을 따라온다
        const g = st.card.cloneNode(true) as HTMLElement;
        g.classList.add('ghost', 'fieldmode');
        g.classList.remove('coach-focus', 'chosen');
        g.removeAttribute('data-card');
        g.removeAttribute('data-act');
        root.appendChild(g);
        st.ghost = g;
        st.card.classList.add('lifted');
      }
      root.classList.add('dragging', st.enemyTarget ? 'drag-enemy' : 'drag-field');
    }
    if (st.arrow) drawArrow(st.arrow, root, st.card, e.clientX, e.clientY);
    if (st.ghost) {
      const hr = root.getBoundingClientRect();
      st.ghost.style.left = `${e.clientX - hr.left}px`;
      st.ghost.style.top = `${e.clientY - hr.top}px`;
    }
    // 놓을 곳 판정
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const enemyEl = under?.closest<HTMLElement>('.enemy:not(.dead)') ?? null;
    const handTop = root.querySelector('.hand')?.getBoundingClientRect().top ?? root.getBoundingClientRect().bottom;
    const inField = e.clientY < handTop - 10;
    root.querySelectorAll('.enemy.aim').forEach((x) => { if (x !== enemyEl) x.classList.remove('aim'); });
    if (st.enemyTarget) {
      const alive = [...root.querySelectorAll<HTMLElement>('.enemy:not(.dead)')];
      const tgt = enemyEl ?? (alive.length === 1 && inField ? alive[0] : null);
      st.hoverUid = tgt ? Number(tgt.dataset.uid) : null;
      tgt?.classList.add('aim');
      const prev = st.armed ? st.lastUid : null;
      st.armed = st.hoverUid !== null;
      if (st.hoverUid !== prev) {
        st.lastUid = st.hoverUid;
        if (st.hoverUid !== null) app.showHitPreview(st.slot, st.hoverUid); else app.clearHitPreview();
      }
    } else {
      if (inField !== st.armed) { if (inField) app.showHitPreview(st.slot, null); else app.clearHitPreview(); }
      st.armed = inField;
    }
    st.arrow?.classList.toggle('armed', st.armed);
    st.ghost?.classList.toggle('armed', st.armed);
  });

  const finish = (cancelled: boolean) => {
    if (!st) return;
    const s = st;
    st = null;
    if (!s.arrow && !s.ghost) return; // 드래그가 아니었으면 탭(클릭)으로 처리된다
    app.swallowClick();
    cleanup(s);
    if (!cancelled && s.armed) playSkill(app, s.slot, s.enemyTarget ? s.hoverUid : null);
    else if (!cancelled) app.toast(s.enemyTarget ? '🎯 적 위에 놓아야 한다' : '✋ 테이블 위로 끌어올려 놓자', 'info');
  };
  window.addEventListener('pointerup', () => finish(false));
  window.addEventListener('pointercancel', () => finish(true));
}
