// 맵 · 보상 · 상점 · 이벤트 · 휴식 · 펜딩(면/재질/스킬) · 가방
import type { App } from '../app';
import { BALANCE } from '../../data/balance';
import { EVENT_BY_ID } from '../../data/events';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { condText, SKILL_BY_ID } from '../../data/skills';
import { RELIC_BY_ID } from '../../data/relics';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { currentOptions } from '../../rules/run';
import { NODE_INFO } from '../../rules/map';
import { donChance, donEV, donMaxStreak, donMin, evText, haggleOdds, pct } from '../../rules/casino';
import { getMods } from '../../rules/ctx';
import { interestFor, itemRarity } from '../../rules/economy';
import { dieFace, esc, fmt, itemHtml, optInfo, pipsHtml, rarityTag } from '../components/parts';
import { consumablesRow, relicStrip, topbar } from './common';
import { slotMachine } from './casino';

const ACT_NAME = ['', '로비', 'VIP 라운지', '하우스 금고'];

export function mapScreen(app: App): string {
  const run = app.run!;
  const opts = currentOptions(run);
  const floors = Array.from({ length: BALANCE.floorsPerAct }, (_, i) => `<i class="${i < run.floor ? 'done' : i === run.floor ? 'cur' : ''}"></i>`).join('');
  const nodes = opts.map((n, i) => {
    const info = NODE_INFO[n.type];
    return `<button class="node ${n.type}" data-act="node" data-arg="${i}"><span class="ne">${info.emoji}</span><span class="grow"><div class="nn">${info.name}</div><div class="muted small">${info.desc}</div></span><span class="muted">▶</span></button>`;
  }).join('');
  return `${topbar(app)}<div class="screen">
    <h2 class="center">${run.act}막 · ${ACT_NAME[run.act]}</h2>
    <div class="floors">${floors}</div>
    <div class="muted small center">${run.floor + 1}층 — 길을 고르자. 이동하면 이자 +${interestFor(run)}G</div>
    <div class="mapnodes">${nodes}</div>
    <div class="grow"></div>
    ${relicStrip(app)}
    <div class="row">${consumablesRow(app)}<div class="grow"></div><button class="btn ghost" data-act="quit">🏳️</button></div>
  </div>`;
}

export function rewardScreen(app: App): string {
  const run = app.run!;
  const rw = run.reward!;
  const collected = rw.base === -1;
  const ui = app.ui;
  const canDon = !collected && !rw.donDone && rw.gold > 0 && rw.donStreak < donMaxStreak(run);
  const don = `<div class="card col center">
    <b>🎲 더블 오어 낫싱</b>
    <div class="die bigdie" id="dondie">${pipsHtml(ui.don.face)}</div>
    <div class="muted small">주사위 ${donMin(run)}~6이 나오면 2배, 아니면 0 (${rw.donStreak}/${donMaxStreak(run)}연속)</div>
    <div class="odds">성공 ${pct(donChance(run))} · ${evText(donEV(run))}</div>
    <div style="min-height:18px;font-weight:800" class="${ui.don.text.includes('성공') ? 'gold' : 'red'}">${esc(ui.don.text)}</div>
    ${run.consumables.includes('insurance') ? '<div class="small green">📄 보험증서: 실패 시 원금 반환</div>' : ''}
    <div class="row center"><button class="btn danger" data-act="don" ${canDon ? '' : 'disabled'}>${rw.gold}G 걸고 굴리기</button><button class="btn primary" data-act="collect" ${collected ? 'disabled' : ''}>${collected ? '수령 완료' : `${rw.gold}G 받기`}</button></div>
  </div>`;
  const opts = rw.options.map((o, i) => itemHtml(o, rw.picked ? 'sold' : '', rw.picked ? '' : `<button class="btn" data-act="pick" data-arg="${i}">선택</button>`)).join('');
  return `${topbar(app)}<div class="screen">
    <h2 class="center gold">승리!</h2>
    <div class="card"><div>기본 보상 <b>${collected ? '' : rw.base + 'G'}</b></div><div>🐷 저금통 <b id="piggyamt">${rw.piggy}G</b> <span class="muted small">(열기·유물 보정 ×${rw.heatMult.toFixed(2)})</span></div>${rw.heal ? `<div class="green">보스 처치: 체력 ${rw.heal} 회복</div>` : ''}</div>
    ${don}
    ${run.pendingFreeSpins > 0 || ui.slot.res || ui.slot.spinning ? `<div class="card col"><b>💰 잭팟 무료 스핀 ×${run.pendingFreeSpins}</b>${slotMachine(app)}<button class="btn primary" data-act="freespin" ${run.pendingFreeSpins > 0 && !ui.slot.spinning ? '' : 'disabled'}>무료 스핀!</button></div>` : ''}
    <h3>보상 선택 <span class="muted small">(1개)</span></h3>
    <div class="col">${opts}</div>
    <button class="btn ${collected || rw.gold === 0 ? 'primary' : ''} big" data-act="leaveReward">${collected ? '계속 ▶' : '골드 받고 계속 ▶'}</button>
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
      <div class="row" style="gap:4px">${it.haggles < maxH ? `<button class="btn ghost" style="min-height:36px;padding:2px 8px;font-size:12px" data-act="haggle" data-arg="${i}" data-tip="흥정 주사위: 1=+50%${m.haggleKeepOnOne ? '(말굽: 유지)' : ''}, 2~5=눈×5% 할인, 6=무료 · 평균 가격 ×${ho.ev.toFixed(2)}">🎲흥정</button>` : `<span class="small muted">🎲${it.lastHaggle ?? ''}</span>`}
      ${hasTag ? `<button class="btn ghost" style="min-height:36px;padding:2px 6px" data-act="pricetag" data-arg="${i}">🏷️</button>` : ''}</div></div>`;
    return itemHtml(it.opt, `${it.sold ? 'sold' : ''} ${r === 'legendary' && !it.sold ? 'legend-glow' : ''}`, right);
  }).join('');
  return `${topbar(app)}<div class="screen">
    <h2 class="center">🛒 상점</h2>
    <div class="odds center">🎲흥정: 6 무료 · 2~5 할인 · 1 바가지(+50%) · 평균 가격 ×${ho.ev.toFixed(2)}</div>
    <div class="col">${items}</div>
    <div class="row">
      <button class="btn grow" data-act="shopReroll">🔄 리롤 ${s.rerollFree ? '<span class="green">무료</span>' : s.rerollCost + 'G'}</button>
      <button class="btn grow" data-act="buyChip">🎰 칩 1 = ${BALANCE.chipPrice}G</button>
    </div>
    <div class="muted small center">리롤 시 주사위를 굴려 6(16.7%)이면 다음 리롤 무료${s.lastRerollDie ? ` · 직전 ${s.lastRerollDie}` : ''}</div>
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
  return `<div class="card col"><div class="dicepick">${picks}</div><div class="center small muted">${MATERIAL_BY_ID[die.material].name} 주사위 #${sel + 1}</div><div class="net">${net}</div></div>`;
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
    return `<div class="modal"><div class="box">
      <h3>${isUp ? `⬆️ 강화할 스킬 (+${Math.round(p.amount * 100)}%)` : `스킬 칸이 가득 찼다: 「${nd!.name}」으로 교체할 칸`}</h3>
      ${nd ? `<div class="small">[${condText(nd.cond)}] ${esc(fmt(nd.desc, nd.v))}</div>` : ''}
      <div class="col">${run.skills.map((s, i) => {
        const d = SKILL_BY_ID[s.id];
        return `<button class="item r-${d.rarity}" style="width:100%" data-act="${isUp ? 'upgrade' : 'replaceSkill'}" data-arg="${i}"><div class="grow" style="text-align:left"><div class="tt">${d.name} ${rarityTag(d.rarity)} ${s.up ? `<span class="green small">+${Math.round(s.up * 100)}%</span>` : ''}</div><div class="ds">[${condText(d.cond)}] ${esc(fmt(d.desc, d.v))}</div></div></button>`;
      }).join('')}</div>
      <button class="btn ghost" data-act="${isUp ? 'cancelPending' : 'replaceSkill'}" data-arg="-1">${isUp ? '취소' : '가져가지 않음'}</button>
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
    <b>주사위 ${run.dice.length}</b>${diceViewer(app, false)}
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
