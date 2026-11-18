// 맵 · 보상 · 상점 · 이벤트 · 휴식 · 펜딩(면/재질/스킬) · 가방
import type { App } from '../app';
import { BALANCE } from '../../data/balance';
import { EVENT_BY_ID } from '../../data/events';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { condText, SKILL_BY_ID } from '../../data/skills';
import { RELIC_BY_ID } from '../../data/relics';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { currentChoices } from '../../rules/run';
import { skillSample } from '../../rules/combat';
import type { RunState } from '../../core/state';
import { NODE_INFO } from '../../rules/map';
import { donMaxStreak, donMin, haggleOdds } from '../../rules/casino';
import { getMods } from '../../rules/ctx';
import { interestFor, itemRarity } from '../../rules/economy';
import { dieFace, esc, fmt, itemHtml, optInfo, pipsHtml, rarityTag } from '../components/parts';
import { consumablesRow, relicStrip, topbar } from './common';
import { slotMachine } from './casino';

const ACT_NAME = ['', '로비', 'VIP 라운지', '하우스 금고'];

export function mapScreen(app: App): string {
  const run = app.run!;
  const F = BALANCE.floorsPerAct;
  const choices = run.screen === 'map' ? currentChoices(run) : [];
  // 지금 위치에서 앞으로 갈 수 있는 노드
  const reach: Set<number>[] = run.map.map(() => new Set<number>());
  if (run.floor < F) {
    for (const c of run.screen === 'map' ? choices : [run.path[run.floor]]) reach[run.floor]?.add(c);
    for (let f = run.floor; f < F - 1; f++) for (const i of reach[f]) for (const j of run.map[f][i].next) reach[f + 1].add(j);
  }
  const state = (f: number, i: number): string => {
    if (f < run.floor || (f === run.floor && run.screen !== 'map')) return run.path[f] === i ? 'visited' : 'skipped';
    if (f === run.floor) return choices.includes(i) ? 'choice' : 'skipped';
    return reach[f].has(i) ? 'future' : 'unreach';
  };
  // 좌표: 아래가 1층, 위가 보스 (퍼센트)
  const ROW = 100 / F;
  const pos = (f: number, n: { x: number }) => ({ x: 8 + n.x * 84, y: 100 - (f + 0.5) * ROW });
  let lines = '';
  run.map.forEach((floor, f) => floor.forEach((n, i) => n.next.forEach((j) => {
    const a = pos(f, n);
    const b = pos(f + 1, run.map[f + 1][j]);
    const sa = state(f, i);
    const sb = state(f + 1, j);
    const cls = sa === 'visited' && (sb === 'visited' || sb === 'choice') ? 'taken' : (sa === 'skipped' || sa === 'unreach' || sb === 'skipped' || sb === 'unreach') ? 'dead' : 'open';
    lines += `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
  })));
  const nodes = run.map.map((floor, f) => floor.map((n, i) => {
    const st = state(f, i);
    const p = pos(f, n);
    const info = NODE_INFO[n.type];
    const ci = choices.indexOf(i);
    const act = st === 'choice' ? `data-act="node" data-arg="${ci}"` : '';
    return `<button class="mnode ${st} t-${n.type}" style="left:${p.x}%;top:${p.y}%" ${act} data-tip="${esc(info.name + ': ' + info.desc)}" ${st === 'choice' ? '' : 'tabindex="-1"'}>
      <span class="me">${info.emoji}</span>${st === 'visited' ? '<span class="mbadge">✓</span>' : ''}<span class="ml">${info.name}</span></button>`;
  }).join('')).join('');
  const floorLabels = Array.from({ length: F }, (_, f) => `<span class="flabel ${f === run.floor ? 'cur' : f < run.floor ? 'done' : ''}" style="top:${100 - (f + 0.5) * ROW}%">${f === F - 1 ? '보스' : `${f + 1}층`}</span>`).join('');
  const done = (run.act - 1) * F + run.floor;
  const acts = [1, 2, 3].map((a) => `<div class="actseg ${a < run.act ? 'done' : a === run.act ? 'cur' : ''}"><b>${a}막</b><span>${ACT_NAME[a]}</span><div class="actdots">${Array.from({ length: F }, (_, f) => `<i class="${a < run.act || (a === run.act && f < run.floor) ? 'on' : a === run.act && f === run.floor ? 'now' : ''}"></i>`).join('')}</div></div>`).join('');
  return `${topbar(app)}<div class="screen mapscreen">
    <div class="acts">${acts}</div>
    <div class="muted small center">전체 진행 ${done}/${F * 3} · <b class="gold">빛나는 칸</b>을 눌러 이동 · 이동하면 이자 +${interestFor(run)}G</div>
    <div class="mapwrap">
      ${floorLabels}
      <svg class="maplines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
      ${nodes}
    </div>
    ${relicStrip(app)}
    <div class="row">${consumablesRow(app)}<div class="grow"></div><button class="btn ghost" data-act="quit" aria-label="포기">🏳️</button></div>
  </div>`;
}

export function rewardScreen(app: App): string {
  const run = app.run!;
  const rw = run.reward!;
  const collected = rw.base === -1; // 1단계(골드) 끝 → 2단계(보상 선택)
  const ui = app.ui;
  const steps = `<div class="steps"><span class="${collected ? 'done' : 'on'}">① 골드 정산</span><i></i><span class="${collected ? 'on' : ''}">② 보상 선택</span></div>`;
  if (!collected) {
    const canDon = !rw.donDone && rw.gold > 0 && rw.donStreak < donMaxStreak(run);
    const spins = run.pendingFreeSpins > 0 || ui.slot.res || ui.slot.spinning;
    return `${topbar(app)}<div class="screen">
      <h2 class="center gold">승리!</h2>
      ${steps}
      <div class="card col">
        <div class="row"><span class="grow">기본 보상</span><b>${rw.base}G</b></div>
        <div class="row"><span class="grow">🐷 저금통 <span class="muted small">(열기·유물 보정 ×${rw.heatMult.toFixed(2)})</span></span><b id="piggyamt">${rw.piggy}G</b></div>
        ${rw.heal ? `<div class="green">보스 처치: 체력 ${rw.heal} 회복</div>` : ''}
        <div class="row total"><span class="grow">받을 골드</span><b class="gold">${rw.gold}G</b></div>
      </div>
      <div class="card col center">
        <b>🎲 더블 오어 낫싱 <span class="muted small">(선택)</span></b>
        <div class="die bigdie" id="dondie">${pipsHtml(ui.don.face)}</div>
        <div class="donrule"><span class="win">🎲 ${faces(donMin(run), 6)} → 2배!</span><span class="lose">🎲 ${faces(1, donMin(run) - 1)} → 0G</span></div>
        <div class="muted small">최대 ${donMaxStreak(run)}번 연속 (${rw.donStreak}/${donMaxStreak(run)})</div>
        <div style="min-height:22px;font-weight:900;font-size:17px" class="${ui.don.text.includes('성공') ? 'gold' : 'red'}">${esc(ui.don.text)}</div>
        ${run.consumables.includes('insurance') ? '<div class="small green">📄 보험증서: 실패 시 원금 반환</div>' : ''}
        <button class="btn danger" data-act="don" ${canDon ? '' : 'disabled'}>${rw.gold}G 걸고 굴리기</button>
      </div>
      ${spins ? `<div class="card col"><b>💰 잭팟 무료 스핀 ×${run.pendingFreeSpins}</b>${slotMachine(app)}<button class="btn primary" data-act="freespin" ${run.pendingFreeSpins > 0 && !ui.slot.spinning ? '' : 'disabled'}>무료 스핀!</button></div>` : ''}
      <div class="grow"></div>
      <button class="btn primary big" data-act="collect">${rw.gold > 0 ? `💰 ${rw.gold}G 받고 다음 ▶` : '다음 ▶'}</button>
    </div>`;
  }
  const kind = rw.options[0]?.kind === 'relic' ? '유물' : '보상';
  const opts = rw.options.map((o, i) => itemHtml(o, rw.picked ? 'sold' : '', rw.picked ? '' : `<button class="btn primary" data-act="pick" data-arg="${i}">가져가기</button>`)).join('');
  return `${topbar(app)}<div class="screen">
    <h2 class="center">${kind} 선택</h2>
    ${steps}
    <div class="center small">하나를 가져가거나, 필요 없으면 건너뛰자.</div>
    <div class="col">${opts}</div>
    <div class="grow"></div>
    <button class="btn ${rw.picked ? 'primary' : ''} big" data-act="leaveReward">${rw.picked ? '계속 ▶' : '건너뛰기 ▶'}</button>
  </div>`;
}

export function shopScreen(app: App): string {
  const run = app.run!;
  const s = run.shop!;
  const m = getMods(run);
  const maxH = 1 + m.haggleCount;
  const ho = haggleOdds(run);
  const hasTag = run.consumables.includes('pricetag');
  const items = s.items.map((it, i) => {
    const r = itemRarity(it.opt);
    const can = run.gold >= it.price;
    const right = it.sold ? '<b class="muted">SOLD</b>' : `<div class="col" style="align-items:flex-end;gap:4px">
      <button class="btn ${can ? 'primary' : ''}" style="min-width:70px" data-act="buy" data-arg="${i}">${it.price}G${it.price !== it.basePrice ? `<br><s class="small">${it.basePrice}</s>` : ''}</button>
      <div class="row" style="gap:4px">${it.haggles < maxH ? `<button class="btn ghost" style="min-height:36px;padding:2px 8px;font-size:12px" data-act="haggle" data-arg="${i}" data-tip="흥정 주사위: 6 → 공짜, 2~5 → 눈×5% 할인, 1 → ${m.haggleKeepOnOne ? '가격 그대로(말굽)' : '50% 비싸짐'}">🎲흥정</button>` : `<span class="small muted">🎲${it.lastHaggle ?? ''}</span>`}
      ${hasTag ? `<button class="btn ghost" style="min-height:36px;padding:2px 6px" data-act="pricetag" data-arg="${i}">🏷️</button>` : ''}</div></div>`;
    return itemHtml(it.opt, `${it.sold ? 'sold' : ''} ${r === 'legendary' && !it.sold ? 'legend-glow' : ''}`, right);
  }).join('');
  return `${topbar(app)}<div class="screen">
    <h2 class="center">🛒 상점</h2>
    <div class="odds center">🎲흥정: 6 → 공짜 · 2~5 → 눈×5% 할인 · 1 → 50% 비싸짐</div>
    <div class="col">${items}</div>
    <div class="row">
      <button class="btn grow" data-act="shopReroll">🔄 리롤 ${s.rerollFree ? '<span class="green">무료</span>' : s.rerollCost + 'G'}</button>
      <button class="btn grow" data-act="buyChip">🎰 칩 1 = ${BALANCE.chipPrice}G</button>
    </div>
    <div class="muted small center">리롤할 때 주사위를 굴려 6이 나오면 다음 리롤 무료${s.lastRerollDie ? ` · 직전 ${s.lastRerollDie}` : ''}</div>
    <button class="btn ghost" data-act="shopEdit">🎲 내 주사위 보기</button>
    ${app.ui.shopEdit ? diceViewer(app, false) : ''}
    <div class="row">${consumablesRow(app)}<div class="grow"></div><button class="btn primary" data-act="leaveShop">나가기 ▶</button></div>
  </div>`;
}

export function eventScreen(app: App): string {
  const run = app.run!;
  const ev = run.event!;
  const def = EVENT_BY_ID[ev.id];
  const choices = ev.done ? '' : def.choices.map((c, i) => {
    const ok = !c.can || c.can(app.ctx);
    return `<button class="item" style="width:100%;${ok ? '' : 'opacity:.4'}" data-act="evChoice" data-arg="${i}" ${ok ? '' : 'disabled'}><div class="grow" style="text-align:left"><div class="tt">${esc(c.label)}</div>${c.odds ? `<span class="odds">${esc(c.odds)}</span>` : ''}</div></button>`;
  }).join('');
  return `${topbar(app)}<div class="screen">
    <div class="center" style="font-size:64px">${def.emoji}</div>
    <h2 class="center">${esc(def.name)}</h2>
    <div class="card">${esc(def.text)}</div>
    <div class="col">${choices}</div>
    ${ev.done ? `<div class="card gold">${esc(ev.resultText ?? '')}</div><button class="btn primary big" data-act="evLeave">계속 ▶</button>` : ''}
  </div>`;
}

export function restScreen(app: App): string {
  const run = app.run!;
  return `${topbar(app)}<div class="screen" style="justify-content:center">
    <div class="center" style="font-size:64px">🛏️</div>
    <h2 class="center">휴게실</h2>
    <button class="item" style="width:100%" data-act="restHeal"><div class="ic">❤️</div><div class="grow" style="text-align:left"><div class="tt">휴식</div><div class="ds">체력 ${Math.round(run.maxHp * BALANCE.restHealPct)} 회복 (30%)</div></div></button>
    <button class="item" style="width:100%" data-act="restUp"><div class="ic">⬆️</div><div class="grow" style="text-align:left"><div class="tt">수련</div><div class="ds">스킬 1개 강화 +${Math.round(BALANCE.restUpgrade * 100)}%</div></div></button>
  </div>`;
}

// ───────────── 주사위 보기 / 편집 ─────────────
const NET_POS = [[2, 1], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3]]; // 6면 전개도 (col,row): 1 위, 2 3 4 5 가운데, 6 아래

export function diceViewer(app: App, applyFace: boolean): string {
  const run = app.run!;
  const sel = Math.min(app.ui.editDie, run.dice.length - 1);
  const picks = run.dice.map((d, i) => dieFace(6, undefined, d.material, `small ${i === sel ? 'on' : ''}`, `data-act="editDie" data-arg="${i}" data-tip="${esc(MATERIAL_BY_ID[d.material].name + ': ' + fmt(MATERIAL_BY_ID[d.material].desc, MATERIAL_BY_ID[d.material].v))}"`)).join('');
  const die = run.dice[sel];
  const net = die.faces.map((f, i) => {
    const sd = f.sticker ? FACE_BY_ID[f.sticker] : undefined;
    const label = sd?.kind === 'replace' ? (sd.wild ? '🃏' : sd.mirror ? '🪞' : String(sd.pip)) : String(f.pip);
    const [c, r] = NET_POS[i];
    return `<div class="face mat-${die.material} ${applyFace ? 'target' : ''}" style="grid-column:${c};grid-row:${r}" ${applyFace ? `data-act="applyFace" data-arg="${i}"` : ''} data-tip="${esc(sd ? `${sd.name}: ${fmt(sd.desc, sd.v)}` : `눈 ${f.pip}`)}">${label}${sd ? `<span class="stk">${sd.emoji}</span>` : ''}</div>`;
  }).join('');
  const m = MATERIAL_BY_ID[die.material];
  const stickers = die.faces.filter((f) => f.sticker).map((f) => { const sd = FACE_BY_ID[f.sticker!]; return `<div class="small">${sd.emoji} <b>${sd.name}</b> (${f.pip} 면) — ${esc(fmt(sd.desc, sd.v))}</div>`; }).join('');
  return `<div class="card col"><div class="dicepick">${picks}</div>
    <div class="matcard"><div class="row"><span style="font-size:22px">${m.icon}</span><b>${m.name} 주사위</b><span class="muted small">#${sel + 1}</span></div><div class="small">${esc(m.long)}</div>${stickers ? `<div class="col" style="gap:2px;margin-top:4px">${stickers}</div>` : ''}</div>
    <div class="net">${net}</div></div>`;
}

function pendingModal(app: App): string {
  const run = app.run!;
  const p = run.pending;
  if (!p) return '';
  if (p.kind === 'face') {
    const f = FACE_BY_ID[p.id];
    return `<div class="modal"><div class="box">
      <h3>${f.emoji} ${f.name} 면 붙이기 ${rarityTag(f.rarity)}</h3>
      <div class="small">${esc(fmt(f.desc, f.v))} <span class="muted">(${f.kind === 'attr' ? '◎ 속성: 원래 눈 유지' : '● 대체: 눈 자체가 바뀜'})</span></div>
      <div class="muted small">주사위를 고르고 붙일 면을 탭하세요. 기존 스티커는 교체됩니다.</div>
      ${diceViewer(app, true)}
      <button class="btn ghost" data-act="cancelPending">버리기</button>
    </div></div>`;
  }
  if (p.kind === 'material') {
    const m = MATERIAL_BY_ID[p.id];
    return `<div class="modal"><div class="box">
      <h3>🎲 ${m.name} 재질 적용 ${rarityTag(m.rarity)}</h3>
      <div class="small">${esc(fmt(m.desc, m.v))}</div>
      <div class="dicepick">${run.dice.map((d, i) => dieFace(6, undefined, d.material, '', `data-act="applyMat" data-arg="${i}" data-tip="${esc(MATERIAL_BY_ID[d.material].name)}"`)).join('')}</div>
      <button class="btn ghost" data-act="cancelPending">버리기</button>
    </div></div>`;
  }
  if (p.kind === 'skillReplace' || p.kind === 'upgrade') {
    const isUp = p.kind === 'upgrade';
    const nd = !isUp ? SKILL_BY_ID[p.id] : null;
    const sel = app.ui.pickSlot;
    const list = run.skills.map((s, i) => {
      const d = SKILL_BY_ID[s.id];
      const change = isUp ? upgradeLine(run, i, p.amount) : '';
      return `<button class="item r-${d.rarity} ${sel === i ? 'picked' : ''}" style="width:100%" data-act="pickSlot" data-arg="${i}">
        <div class="grow" style="text-align:left">
          <div class="tt">${sel === i ? '✔ ' : ''}${d.name} ${rarityTag(d.rarity)} ${s.up ? `<span class="green small">강화 +${Math.round(s.up * 100)}%</span>` : ''}</div>
          <div class="ds">[${condText(d.cond)}] ${esc(fmt(d.desc, d.v))}</div>
          ${change}
        </div></button>`;
    }).join('');
    const selName = sel !== null && run.skills[sel] ? SKILL_BY_ID[run.skills[sel].id].name : '';
    const confirm = isUp
      ? `<button class="btn primary big" data-act="upgradeConfirm" ${sel === null ? 'disabled' : ''}>${sel === null ? '강화할 스킬을 고르세요' : `⬆ 「${selName}」 강화하기`}</button>`
      : `<button class="btn primary big" data-act="replaceConfirm" ${sel === null ? 'disabled' : ''}>${sel === null ? '버릴 스킬을 고르세요' : `「${selName}」 버리고 「${nd!.name}」 넣기`}</button>`;
    return `<div class="modal"><div class="box">
      <h3>${isUp ? `⬆️ 스킬 강화 (효과 +${Math.round(p.amount * 100)}%)` : '스킬 칸이 가득 찼다'}</h3>
      ${nd ? `<div class="item r-${nd.rarity} newskill"><div class="grow"><div class="tt">새 스킬: ${nd.name} ${rarityTag(nd.rarity)}</div><div class="ds">[${condText(nd.cond)}] ${esc(fmt(nd.desc, nd.v))}</div></div></div><div class="small center">교체할 스킬을 탭해서 고른 뒤 아래 버튼으로 확정</div>` : '<div class="small center">스킬을 탭해서 고른 뒤 아래 버튼으로 확정 · 숫자는 족보·열기 배율을 빼고 계산한 값</div>'}
      <div class="col">${list}</div>
      ${confirm}
      <button class="btn ghost" data-act="${isUp ? 'cancelPending' : 'replaceSkill'}" data-arg="-1">${isUp ? '강화 안 함' : '새 스킬 가져가지 않음'}</button>
    </div></div>`;
  }
  return '';
}

function offerModal(app: App): string {
  const of = app.run!.offer;
  if (!of) return '';
  return `<div class="modal"><div class="box">
    <h3>${esc(of.title)}</h3>
    <div class="col">${of.options.map((o, i) => itemHtml(o, '', `<button class="btn" data-act="offer" data-arg="${i}">선택</button>`)).join('')}</div>
    <button class="btn ghost" data-act="offer" data-arg="-1">건너뛰기</button>
  </div></div>`;
}

function bagModal(app: App): string {
  const run = app.run!;
  const relics = run.relics.map((id) => itemHtml({ kind: 'relic', id })).join('') || '<div class="muted small">유물 없음</div>';
  const cons = run.consumables.map((id, i) => itemHtml({ kind: 'consumable', id }, '', CONSUMABLE_BY_ID[id].when !== 'passive' ? `<button class="btn" data-act="useCons" data-arg="${i}">사용</button>` : '<span class="small muted">자동</span>')).join('') || '<div class="muted small">소모품 없음</div>';
  const skills = run.skills.map((s) => { const d = SKILL_BY_ID[s.id]; return `<div class="item r-${d.rarity}"><div class="grow"><div class="tt">${d.name} ${rarityTag(d.rarity)} ${s.up ? `<span class="green small">+${Math.round(s.up * 100)}%</span>` : ''}</div><div class="ds">[${condText(d.cond)}] ${esc(fmt(d.desc, d.v))}</div></div></div>`; }).join('');
  return `<div class="modal"><div class="box">
    <div class="row"><h3 class="grow">🎒 가방</h3><button class="btn ghost" data-act="closeModal" data-always="1">✕</button></div>
    <b>유물 ${run.relics.length}</b><div class="col">${relics}</div>
    <b>소모품 ${run.consumables.length}/${BALANCE.maxConsumables}</b><div class="col">${cons}</div>
    <b>스킬 ${run.skills.length}/${run.maxSlots}</b><div class="col">${skills}</div>
    <div class="row"><b class="grow">주사위 ${run.dice.length}</b><button class="btn ghost" style="min-height:36px" data-act="modal" data-arg="hands" data-always="1">📖 재질·족보 설명</button></div>${diceViewer(app, false)}
    <div class="row"><button class="btn ghost" data-act="settings" data-always="1">⚙️ 설정</button><button class="btn ghost" data-act="back" data-always="1">타이틀</button><button class="btn danger" data-act="quit" data-always="1">포기</button></div>
  </div></div>`;
}

function quitModal(): string {
  return `<div class="modal"><div class="box center">
    <h3>이번 판을 포기할까?</h3><div class="muted small">도달 기록만큼 해금 포인트는 받는다.</div>
    <div class="row center"><button class="btn danger" data-act="abandon">포기</button><button class="btn" data-act="closeModal">계속</button></div>
  </div></div>`;
}

export function runModals(app: App, extra: { paytable: () => string; scratch: () => string; mystery: () => string }): string {
  const ui = app.ui;
  const run = app.run!;
  if (run.offer) return offerModal(app);
  if (run.pending) return pendingModal(app);
  switch (ui.modal) {
    case 'bag': return bagModal(app);
    case 'paytable': return extra.paytable();
    case 'scratch': return extra.scratch();
    case 'mystery': return extra.mystery();
    case 'quit': return quitModal();
    default: return '';
  }
}

export { optInfo, RELIC_BY_ID };

/** 강화 전후 실제 수치 (대표 주사위 기준) */
function upgradeLine(run: RunState, slot: number, amount: number): string {
  const s = run.skills[slot];
  const before = skillSample(run, slot, s.up);
  const after = skillSample(run, slot, s.up + amount);
  const mult = `<span class="muted">효과 ×${(1 + s.up).toFixed(1)} → ×${(1 + s.up + amount).toFixed(1)}</span>`;
  if (!before || !after) return `<div class="upline none">${mult}</div>`;
  const parts: string[] = [];
  const stat = (icon: string, cls: string, a: number, b: number) => { if (a || b) parts.push(`<span class="${cls}">${icon} ${a} → <b>${b}</b></span> <span class="green">(+${b - a})</span>`); };
  stat('⚔', 'dmgc', before.dmg, after.dmg);
  stat('🛡', 'blkc', before.block, after.block);
  stat('❤', 'green', before.heal, after.heal);
  stat('☠', 'green', before.poison, after.poison);
  stat('🪙', 'gold', before.gold, after.gold);
  stat('🐷', 'gold', before.piggy, after.piggy);
  const def = SKILL_BY_ID[s.id];
  const basis = def.sampleBlock ? `방어도 ${def.sampleBlock}일 때` : before.chance ? '명중하면' : `🎲${before.pips.join('·')} 기준`;
  const changed = parts.some((x) => !x.includes('(+0)'));
  if (!parts.length || !changed) return `<div class="upline none">⚠ 강화해도 수치가 바뀌지 않는 스킬 · ${mult}</div>`;
  return `<div class="upline"><span class="muted">${basis}:</span> ${parts.join(' · ')}</div>`;
}

/** 주사위 눈 범위를 "3·4·5·6" 형태로 */
function faces(lo: number, hi: number): string {
  if (hi < lo) return '없음';
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).join('·');
}
