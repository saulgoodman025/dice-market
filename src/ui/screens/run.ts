// 맵 · 보상 · 상점 · 이벤트 · 휴식 · 펜딩(면/재질/스킬) · 가방
import type { App } from '../app';
import { BALANCE } from '../../data/balance';
import { EVENT_BY_ID } from '../../data/events';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { CARD_BY_ID, cardDesc, resolveCard } from '../../data/cards';
import { COMBOS, COMBO_BY_ID, TAG_TIER_FX } from '../../data/sets';
import { TAG_INFO, TAGS, type Tag } from '../../data/tags';
import { AUGMENT_BY_ID, AUG_TIER_INFO } from '../../data/augments';
import { activeCombos, augmentOdds, canRerollAugment, nextTierAt, PRISM_ROULETTE, tagCounts, tierOf } from '../../rules/sets';
import { canRemoveMore, canUpgradeCard, removePrice } from '../../rules/run';
import { gambleOddsBonus } from '../../rules/combat';
import { RELIC_BY_ID } from '../../data/relics';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { currentChoices } from '../../rules/run';
import type { CardInst, RunState } from '../../core/state';
import { NODE_INFO } from '../../rules/map';
import { donMaxStreak, donMin } from '../../rules/casino';
import { getMods } from '../../rules/ctx';
import { interestFor, itemRarity } from '../../rules/economy';
import { cardFace, cardInstFace, dieFace, esc, fmt, itemHtml, optInfo, pipsHtml, RAR_NAME, rarityTag } from '../components/parts';
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
  const acts = run.act > 3 ? `<div class="actseg cur" style="grid-column:1/-1"><b>♾️ 엔드리스 ${run.act}막</b><span>적 체력 +${40 * (run.act - 3)}% · 공격 +${2 * (run.act - 3)}</span><div class="actdots">${Array.from({ length: F }, (_, f) => `<i class="${f < run.floor ? 'on' : f === run.floor ? 'now' : ''}"></i>`).join('')}</div></div>` : [1, 2, 3].map((a) => `<div class="actseg ${a < run.act ? 'done' : a === run.act ? 'cur' : ''}"><b>${a}막</b><span>${ACT_NAME[a]}</span><div class="actdots">${Array.from({ length: F }, (_, f) => `<i class="${a < run.act || (a === run.act && f < run.floor) ? 'on' : a === run.act && f === run.floor ? 'now' : ''}"></i>`).join('')}</div></div>`).join('');
  return `${topbar(app)}<div class="screen mapscreen">
    <div class="acts">${acts}</div>
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
  const cardStep = collected && !rw.cardDone;
  const steps = `<div class="steps"><span class="${collected ? 'done' : 'on'}">① 골드</span><i></i><span class="${cardStep ? 'on' : rw.cardDone ? 'done' : ''}">② 카드</span><i></i><span class="${rw.cardDone ? 'on' : ''}">③ ${rw.combatKind === 'normal' ? '면 스티커' : '유물'}</span></div>`;
  if (!collected) {
    const rolling = ui.don.rolling && !!ui.don.before;
    const gold = rolling ? ui.don.before!.gold : rw.gold;
    const streak = rolling ? ui.don.before!.streak : rw.donStreak;
    const canDon = !rolling && !rw.donDone && rw.gold > 0 && rw.donStreak < donMaxStreak(run);
    const spins = run.pendingFreeSpins > 0 || ui.slot.res || ui.slot.spinning;
    return `${topbar(app)}<div class="screen">
      <h2 class="center gold">승리!</h2>
      ${steps}
      <div class="card col">
        <div class="row"><span class="grow">기본 보상</span><b>${rw.base}G</b></div>
        <div class="row"><span class="grow">🐷 저금통 ${rw.heatMult !== 1 ? `<span class="gold small">×${rw.heatMult.toFixed(2)}</span>` : ''}</span><b id="piggyamt">${rw.piggy}G</b></div>
        ${rw.heal ? `<div class="green">보스 처치: 체력 ${rw.heal} 회복</div>` : ''}
        <div class="row total"><span class="grow">받을 골드</span><b class="gold">${gold}G</b></div>
      </div>
      <div class="card col center">
        <b>🎲 더블 오어 낫싱</b>
        <div class="die bigdie" id="dondie">${pipsHtml(ui.don.face)}</div>
        <div class="donrule"><span class="win">🎲 ${faces(donMin(run), 6)} → 2배!</span><span class="lose">🎲 ${faces(1, donMin(run) - 1)} → 0G</span></div>
        <div class="muted small">최대 ${donMaxStreak(run)}번 연속 (${streak}/${donMaxStreak(run)})</div>
        <div style="min-height:22px;font-weight:900;font-size:17px" class="${ui.don.text.includes('성공') ? 'gold' : 'red'}">${esc(ui.don.text)}</div>
        ${run.consumables.includes('insurance') ? '<div class="small green">📄 보험증서: 실패 시 원금 반환</div>' : ''}
        <button class="btn danger" data-act="don" ${canDon ? '' : 'disabled'}>${rolling ? '굴리는 중…' : `${gold}G 걸고 굴리기`}</button>
      </div>
      ${spins ? `<div class="card col"><b>💰 잭팟 무료 스핀 ×${run.pendingFreeSpins}</b>${slotMachine(app)}<button class="btn primary" data-act="freespin" ${run.pendingFreeSpins > 0 && !ui.slot.spinning ? '' : 'disabled'}>무료 스핀!</button></div>` : ''}
      <div class="grow"></div>
      <button class="btn primary big" data-act="collect" ${rolling ? 'disabled' : ''}>${rolling ? '결과를 기다리는 중…' : gold > 0 ? `💰 ${gold}G 받고 다음 ▶` : '다음 ▶'}</button>
    </div>`;
  }
  if (cardStep) return cardRewardScreen(app, steps);
  const kind = rw.options[0]?.kind === 'relic' ? '유물' : '면 스티커';
  const sel = ui.rewardSel;
  const RN = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' } as const;
  const cards = rw.options.map((o, i) => {
    const info = optInfo(o);
    const icon = info.emoji;
    const cost = o.kind === 'card' ? `<span class="rccost">${CARD_BY_ID[o.id].cost}</span>` : '';
    return `<button class="rcard rar-${info.rarity} ${sel === i ? 'sel' : ''} ${rw.picked ? 'done' : ''}" style="animation-delay:${i * 0.08}s" ${rw.picked ? 'disabled' : `data-act="rewardSel" data-arg="${i}"`}>
      <span class="rrib">${RN[info.rarity]}</span>${cost}
      <span class="ricon">${icon}</span>
      <span class="rname">${esc(info.name)}</span>
      <span class="rkind">${info.kindLabel}</span>
      <span class="rdesc">${esc(info.desc)}</span>
      ${sel === i ? '<span class="rcheck">✔</span>' : ''}
    </button>`;
  }).join('');
  const chosen = sel !== null && rw.options[sel] ? optInfo(rw.options[sel]).name : '';
  return `${topbar(app)}<div class="screen rewardpick">
    <h2 class="center">${kind} 선택</h2>
    ${steps}
    <div class="rcards">${cards}</div>
    ${rw.picked ? '' : `<button class="btn primary big" data-act="rewardConfirm" ${sel === null ? 'disabled' : ''}>${sel === null ? '카드를 고르세요' : `「${esc(chosen)}」 가져가기`}</button>`}
    <button class="btn ${rw.picked ? 'primary' : 'ghost'} big" data-act="leaveReward">${rw.picked ? '계속 ▶' : '건너뛰기 ▶'}</button>
  </div>`;
}

/** 카드 보상: 3장 중 1장 (건너뛰면 골드) · 태그 진행·콤보 암시 */
function cardRewardScreen(app: App, steps: string): string {
  const run = app.run!;
  const rw = run.reward!;
  const sel = app.ui.cardSel;
  const counts = tagCounts(run);
  const RN = { normal: '일반 전투', elite: '엘리트', boss: '보스' } as const;
  const w = BALANCE.cardRewardWeights[rw.combatKind];
  const tot = w.common + w.rare + w.epic + w.legendary;
  const pct = (x: number) => `${Math.round((x / tot) * 100)}%`;
  const cards = rw.cards.map((id, i) => {
    const rc = resolveCard({ id, up: null });
    const extra = `${tagPreview(counts, rc.tag)}${comboHint(app, id)}`;
    return `<div class="rcwrap ${sel === null ? 'anim' : ''}" style="animation-delay:${i * 0.08}s">${cardFace(rc, { cls: `big ${sel === i ? 'sel' : ''}`, attrs: `data-act="cardSel" data-arg="${i}"`, oddsBonus: gambleOddsBonus({ run, emit: () => {} }) })}${extra}</div>`;
  }).join('');
  const chosen = sel !== null && rw.cards[sel] ? CARD_BY_ID[rw.cards[sel]].name : '';
  return `${topbar(app)}<div class="screen rewardpick">
    <h2 class="center">카드 보상</h2>
    ${steps}
    <div class="odds center">${RN[rw.combatKind]} 등급 확률: 일반 ${pct(w.common)} · 희귀 ${pct(w.rare)} · 영웅 ${pct(w.epic)} · 전설 ${pct(w.legendary)}</div>
    <div class="dgrid three">${cards}</div>
    <button class="btn primary big" data-act="cardConfirm" ${sel === null ? 'disabled' : ''}>${sel === null ? '카드를 고르세요' : `「${esc(chosen)}」 덱에 넣기`}</button>
    <button class="btn ghost big" data-act="cardSkip">건너뛰기 (골드 +${BALANCE.cardSkipGold}) ▶</button>
  </div>`;
}

/** 고르면 바뀌는 태그 단계를 미리 보여준다 */
function tagPreview(counts: Record<Tag, number>, tag?: Tag): string {
  if (!tag) return '<div class="tagpv muted">태그 없음</div>';
  const a = counts[tag];
  const b = a + 1;
  const up = tierOf(b) > tierOf(a);
  const nt = nextTierAt(a);
  return `<div class="tagpv ${up ? 'up' : ''}">${TAG_INFO[tag].icon} ${TAG_INFO[tag].name} ${a} → <b>${b}</b>${up ? ` <span class="gold">(${tierOf(b)}단계 달성!)</span>` : nt ? ` <span class="muted">/ ${nt}</span>` : ''}</div>`;
}

/** 숨은 콤보 암시: 덱에 짝이 있으면 (발견한 콤보면 이름까지) */
function comboHint(app: App, id: string): string {
  const run = app.run!;
  const deck = new Set(run.deck.map((c) => c.id));
  const hits = COMBOS.filter((c) => (c.a === id && deck.has(c.b)) || (c.b === id && deck.has(c.a)));
  return hits.map((c) => {
    const pair = CARD_BY_ID[c.a === id ? c.b : c.a];
    return app.meta.codex.combos.includes(c.id) ? `<div class="combohint known">🔗 ${esc(c.name)}: ${esc(pair.name)}와 반응</div>` : '<div class="combohint">❔ 덱의 무언가와 반응합니다</div>';
  }).join('');
}

export function shopScreen(app: App): string {
  const run = app.run!;
  const s = run.shop!;
  const hasTag = run.consumables.includes('pricetag');
  const items = s.items.map((it, i) => {
    const r = itemRarity(it.opt);
    const can = run.gold >= it.price;
    const right = it.sold ? '<b class="soldtag">SOLD</b>' : `<div class="shopbuy">
      ${hasTag ? `<button class="minibtn" data-act="pricetag" data-arg="${i}" aria-label="가격표" data-tip="가격표: 이 물건 50% 할인">🏷️</button>` : ''}
      <button class="pricebtn ${can ? '' : 'poor'}" data-act="buy" data-arg="${i}">${it.price}G${it.price !== it.basePrice ? `<s>${it.basePrice}</s>` : ''}</button></div>`;
    const info = optInfo(it.opt);
    return itemHtml(it.opt, `${it.sold ? 'sold' : ''} ${r === 'legendary' && !it.sold ? 'legend-glow' : ''} ${it.opt.kind === 'card' ? 'cardItem' : ''}`, right, `data-tip="${esc(`${info.name}: ${info.desc}`)}"`);
  }).join('');
  const rp = removePrice(run);
  const canRm = !s.removeUsed && run.gold >= rp && canRemoveMore(run);
  const removeRow = `<div class="item"><div class="ic">🗑️</div><div class="grow"><div class="tt">카드 삭제 서비스</div><div class="ds">${s.removeUsed ? '이번 상점에서 사용함' : canRemoveMore(run) ? '덱에서 카드 1장 삭제' : `덱 최소 ${BALANCE.minDeck}장`}</div></div>
    <div class="shopbuy"><button class="pricebtn ${canRm ? '' : 'poor'}" data-act="shopRemove" ${canRm ? '' : 'disabled'}>${s.removeUsed ? '완료' : `${rp}G`}</button></div></div>`;
  return `${topbar(app)}<div class="screen noscroll shopscreen">
    <div class="shoplist">${items}${removeRow}</div>
    <div class="subtools">
      <button data-act="shopReroll" ${s.rerolls >= BALANCE.shopRerollMax ? 'disabled' : ''} data-tip="물건 전체 새로고침 (상점마다 1번, 🎲6이면 비용 환급)">🔄 <span>리롤</span><b>${s.rerolls >= BALANCE.shopRerollMax ? '끝' : s.rerollFree ? '무료' : s.rerollCost + 'G'}</b></button>
      <button data-act="buyChip" data-tip="카지노 칩 (판이 끝나면 사라짐)">🎰 <span>칩 1개</span><b>${BALANCE.chipPrice}G</b></button>
      <button data-act="shopEdit" class="${app.ui.shopEdit ? 'on' : ''}">🎲 <span>내 주사위</span></button>
    </div>
    <div class="row">${consumablesRow(app)}<button class="btn primary grow" data-act="leaveShop">나가기</button></div>
  </div>
  ${app.ui.shopEdit ? `<div class="modal"><div class="box"><div class="row"><h3 class="grow">내 주사위</h3><button class="btn ghost" data-act="shopEdit">✕</button></div>${diceViewer(app, false)}</div></div>` : ''}`;
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
  const pick = app.ui.restPick;
  const heal = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * BALANCE.restHealPct));
  const upN = run.deck.filter((c) => canUpgradeCard(run, c.uid)).length;
  const rmOk = canRemoveMore(run);
  const opt = (id: 'heal' | 'up' | 'remove', icon: string, title: string, desc: string, ok = true) =>
    `<button class="item restopt ${pick === id ? 'picked' : ''}" style="width:100%;${ok ? '' : 'opacity:.45'}" ${ok ? `data-act="restPick" data-arg="${id}"` : 'disabled'}><div class="ic">${icon}</div><div class="grow" style="text-align:left"><div class="tt">${pick === id ? '✔ ' : ''}${title}</div><div class="ds">${desc}</div></div></button>`;
  const label = pick === 'heal' ? '휴식하기' : pick === 'up' ? '강화할 카드 고르기' : pick === 'remove' ? '지울 카드 고르기' : '하나를 고르세요';
  return `${topbar(app)}<div class="screen" style="justify-content:center">
    <div class="center" style="font-size:64px">🛏️</div>
    <h2 class="center">휴게실</h2>
    ${opt('heal', '❤️', '휴식', `체력 ${run.hp} → ${run.hp + heal} (+${heal})`)}
    ${opt('up', '⬆️', '수련', upN ? `카드 1장 강화 (가능 ${upN}장)` : '강화할 카드 없음', upN > 0)}
    ${opt('remove', '🗑️', '제거', rmOk ? '카드 1장 삭제' : `덱 최소 ${BALANCE.minDeck}장`, rmOk)}
    <button class="btn primary big" data-act="restConfirm" ${pick ? '' : 'disabled'}>${label}</button>
  </div>`;
}

/** 스티커가 붙은 면을 강조한 주사위 전개도 */
function faceNet(app: App, dieIdx: number, faceIdx: number): string {
  const run = app.run!;
  const picks = run.dice.map((d, i) => dieFace(6, undefined, d.material, `small ${i === dieIdx ? 'on' : ''}`)).join('');
  const die = run.dice[dieIdx];
  const net = die.faces.map((f, i) => {
    const sd = f.sticker ? FACE_BY_ID[f.sticker] : undefined;
    const label = sd?.kind === 'replace' ? (sd.wild ? '🃏' : sd.mirror ? '🪞' : String(sd.pip)) : String(f.pip);
    const [c, r] = NET_POS[i];
    return `<div class="face mat-${die.material} ${i === faceIdx ? 'newface' : ''}" style="grid-column:${c};grid-row:${r}">${label}${sd ? `<span class="stk">${sd.emoji}</span>` : ''}</div>`;
  }).join('');
  return `<div class="card col"><div class="dicepick">${picks}</div><div class="net">${net}</div></div>`;
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
    return `<div class="face mat-${die.material} ${applyFace ? 'target' : ''} ${applyFace && app.ui.pickFace === i ? 'pickedFace' : ''}" style="grid-column:${c};grid-row:${r}" ${applyFace ? `data-act="pickFace" data-arg="${i}"` : ''} data-tip="${esc(sd ? `${sd.name}: ${fmt(sd.desc, sd.v)}` : `눈 ${f.pip}`)}">${label}${sd ? `<span class="stk">${sd.emoji}</span>` : ''}</div>`;
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
  if (p.kind === 'faceShow') {
    const f = FACE_BY_ID[p.id];
    const die = run.dice[p.dieIdx];
    const old = p.replaced ? FACE_BY_ID[p.replaced] : null;
    return `<div class="modal"><div class="box">
      <h3>${f.emoji} ${f.name} 면을 붙였다 ${rarityTag(f.rarity)}</h3>
      <div class="small">${esc(fmt(f.desc, f.v))}</div>
      <div class="card center"><b>${p.dieIdx + 1}번 주사위</b>의 <b class="gold">눈 ${die.faces[p.faceIdx].pip}</b> 면에 붙었습니다${old ? `<br><span class="red small">(원래 있던 ${old.emoji} ${old.name} 면은 사라졌다)</span>` : ''}</div>
      ${faceNet(app, p.dieIdx, p.faceIdx)}
      <button class="btn primary big" data-act="cancelPending">확인</button>
    </div></div>`;
  }
  if (p.kind === 'face') {
    const f = FACE_BY_ID[p.id];
    return `<div class="modal"><div class="box">
      <h3>${f.emoji} ${f.name} 면 붙이기 ${rarityTag(f.rarity)}</h3>
      <div class="small">${esc(fmt(f.desc, f.v))} <span class="muted">(${f.kind === 'attr' ? '◎ 속성: 원래 눈 유지' : '● 대체: 눈 자체가 바뀜'})</span></div>
      ${diceViewer(app, true)}
      ${faceConfirm(app, f.name)}
      <button class="btn ghost" data-act="cancelPending">버리기</button>
    </div></div>`;
  }
  if (p.kind === 'material') {
    const m = MATERIAL_BY_ID[p.id];
    return `<div class="modal"><div class="box">
      <h3>🎲 ${m.name} 재질 적용 ${rarityTag(m.rarity)}</h3>
      <div class="small">${esc(fmt(m.desc, m.v))}</div>
      <div class="dicepick">${run.dice.map((d, i) => dieFace(6, undefined, d.material, app.ui.pickMat === i ? 'pickedDie' : '', `data-act="pickMat" data-arg="${i}" data-tip="${esc(MATERIAL_BY_ID[d.material].name)}"`)).join('')}</div>
      ${app.ui.pickMat !== null ? `<div class="small center">${MATERIAL_BY_ID[run.dice[app.ui.pickMat].material].icon} ${MATERIAL_BY_ID[run.dice[app.ui.pickMat].material].name} 주사위 → ${m.icon} ${m.name} 주사위</div>` : ''}
      <button class="btn primary big" data-act="confirmMat" ${app.ui.pickMat === null ? 'disabled' : ''}>${app.ui.pickMat === null ? '주사위를 고르세요' : '✔ 이 주사위에 적용'}</button>
      <button class="btn ghost" data-act="cancelPending">버리기</button>
    </div></div>`;
  }
  if (p.kind === 'upgradeCard') return upgradeModal(app);
  if (p.kind === 'removeCard') return removeModal(app);
  return '';
}

/** 덱 정렬 */
function sortedDeck(app: App) {
  const run = app.run!;
  const RO = ['basic', 'common', 'rare', 'epic', 'legendary', 'curse'];
  const key = (id: string) => {
    const d = CARD_BY_ID[id];
    if (app.ui.deckSort === 'rarity') return RO.indexOf(d.rarity) * 100 + d.cost;
    if (app.ui.deckSort === 'cost') return d.cost * 100 + RO.indexOf(d.rarity);
    return (d.tag ? TAGS.indexOf(d.tag) + 1 : d.rarity === 'curse' ? 20 : 0) * 100 + RO.indexOf(d.rarity);
  };
  return [...run.deck].sort((a, b) => key(a.id) - key(b.id) || a.id.localeCompare(b.id));
}

function sortTabs(app: App): string {
  const t = app.ui.deckSort;
  return `<div class="tabs small">${(['tag', 'rarity', 'cost'] as const).map((k) => `<button class="${t === k ? 'on' : ''}" data-act="deckSort" data-arg="${k}" data-always="1">${{ tag: '태그별', rarity: '등급별', cost: '비용별' }[k]}</button>`).join('')}</div>`;
}

function upgradeModal(app: App): string {
  const run = app.run!;
  const p = run.pending!;
  const sel = app.ui.pickCard[0];
  const inst = run.deck.find((c) => c.uid === sel);
  const grid = sortedDeck(app).map((c) => {
    const ok = canUpgradeCard(run, c.uid);
    return cardInstFace(c, { cls: `${sel === c.uid ? 'sel' : ''} ${ok ? '' : 'noup'}`, attrs: ok ? `data-act="pickCard" data-arg="${c.uid}"` : '' });
  }).join('');
  let compare = '';
  if (inst) {
    const def = CARD_BY_ID[inst.id];
    const base = resolveCard({ id: inst.id, up: null });
    const nums = (t: string): string[] => [...(t.match(/\d+(\.\d+)?%?/g) ?? [])];
    const baseNums = nums(cardDesc(base));
    const branch = (b: 'A' | 'B') => {
      const rc = resolveCard({ id: inst.id, up: b });
      const changed = nums(cardDesc(rc)).filter((x) => !baseNums.includes(x));
      const costCh = rc.cost !== base.cost ? `<div class="upnote">비용 ${base.cost} → <mark>${rc.cost}</mark></div>` : '';
      return `<div class="upcol ${app.ui.upBranch === b ? 'sel' : ''}" data-act="upBranch" data-arg="${b}">
        <div class="uplabel">강화 ${b}: ${esc(def.upgrades![b].label)}</div>
        ${cardFace(rc, { up: b, highlight: changed })}${costCh}</div>`;
    };
    compare = `<div class="upcmp">${branch('A')}${branch('B')}</div>`;
  }
  return `<div class="modal"><div class="box wide">
    <h3>⬆️ 카드 강화</h3>
    ${inst ? `<div class="small center">원래: ${esc(cardDesc(resolveCard({ id: inst.id, up: null })))}</div>${compare}` : `<div class="small center">강화할 카드를 고르세요</div>${sortTabs(app)}<div class="dgrid">${grid}</div>`}
    ${inst ? `<button class="btn primary big" data-act="upgradeConfirm" ${app.ui.upBranch ? '' : 'disabled'}>${app.ui.upBranch ? `⬆ 강화 ${app.ui.upBranch}로 확정` : 'A 또는 B를 고르세요'}</button>
      <button class="btn ghost" data-act="pickCard" data-arg="${inst.uid}">← 다른 카드 고르기</button>` : ''}
    ${p.then === 'rest' ? '<button class="btn ghost" data-act="restBack">← 뒤로 (휴게실 선택지)</button>' : '<button class="btn ghost" data-act="cancelPending">강화 안 함</button>'}
  </div></div>`;
}

function removeModal(app: App): string {
  const run = app.run!;
  const p = run.pending as Extract<NonNullable<RunState['pending']>, { kind: 'removeCard' }>;
  const sel = app.ui.pickCard;
  const grid = sortedDeck(app).map((c) => cardInstFace(c, { cls: sel.includes(c.uid) ? 'sel rm' : '', attrs: `data-act="pickCard" data-arg="${c.uid}"` })).join('');
  const ok = sel.length === p.count && canRemoveMore(run, p.count);
  const title = p.shredder ? '🗑 파쇄기 룰렛' : '🗑 카드 삭제';
  const odds = p.shredder ? `<div class="odds center">🎰 칩 ${BALANCE.shredderChips} · ${Math.round(shredderOddsPct(app))}%: 삭제 / ${100 - Math.round(shredderOddsPct(app))}%: 저주 카드 1장 추가</div>` : '';
  const cost = [p.cost ? `${p.cost}G` : '', p.hpCost ? `체력 -${p.hpCost}` : ''].filter(Boolean).join(' · ');
  return `<div class="modal"><div class="box wide">
    <h3>${title} <span class="muted small">${p.count}장 고르기${cost ? ` · ${cost}` : ''}</span></h3>
    ${odds}
    ${canRemoveMore(run, p.count) ? '' : `<div class="red small center">덱이 ${BALANCE.minDeck}장 미만이 될 수 없다</div>`}
    ${sortTabs(app)}
    <div class="dgrid">${grid}</div>
    <button class="btn ${p.shredder ? 'danger' : 'primary'} big" data-act="removeConfirm" ${ok ? '' : 'disabled'}>${ok ? (p.shredder ? '🎰 파쇄기 돌리기' : `🗑 ${sel.map((u) => CARD_BY_ID[run.deck.find((c) => c.uid === u)!.id].name).join(', ')} 삭제`) : `카드 ${p.count}장을 고르세요`}</button>
    ${p.then === 'rest' ? '<button class="btn ghost" data-act="restBack">← 뒤로 (휴게실 선택지)</button>' : '<button class="btn ghost" data-act="cancelPending">그만두기</button>'}
  </div></div>`;
}

function shredderOddsPct(app: App): number {
  return Math.min(100, (BALANCE.shredderWin * 100) + getMods(app.run!).casinoOdds);
}

/** 🂠 덱 보기 (맵·상점·전투 어디서나) */
function deckModal(app: App): string {
  const run = app.run!;
  const counts = tagCounts(run);
  const tags = TAGS.filter((t) => counts[t] > 0).map((t) => {
    const tier = tierOf(counts[t]);
    const nt = nextTierAt(counts[t]);
    const fx = TAG_TIER_FX[t].slice(0, Math.max(1, tier)).map((x, i) => `<div class="small ${i < tier ? '' : 'muted'}">${i + 1}단계: ${esc(x.desc)}</div>`).join('');
    return `<div class="tagrow ${tier ? 't' + tier : ''}"><b>${TAG_INFO[t].icon} ${TAG_INFO[t].name} ${counts[t]}${nt ? `/${nt}` : ' (최대)'}</b>${fx}</div>`;
  }).join('') || '<div class="muted small">아직 태그 카드가 없다 (3장 모으면 1단계)</div>';
  const combos = activeCombos(run).map((c) => `<div class="small">🔗 <b>${esc(c.name)}</b>: ${esc(c.desc)}</div>`).join('');
  const augs = run.augments.map((id) => { const a = AUGMENT_BY_ID[id]; return `<span class="aug t-${a.tier}" data-tip="${esc(`${a.name} (${AUG_TIER_INFO[a.tier].name}${a.tag ? ' · ' + TAG_INFO[a.tag].icon + '+1' : ''})\n${a.desc}`)}">${a.icon}</span>`; }).join('');
  return `<div class="modal"><div class="box wide">
    <div class="row"><h3 class="grow">🂠 내 덱 ${run.deck.length}장</h3><button class="btn ghost" data-act="closeModal" data-always="1">✕</button></div>
    <div class="col" style="gap:4px">${tags}</div>
    ${combos ? `<div class="col" style="gap:2px">${combos}</div>` : ''}
    ${augs ? `<div class="row augrow"><b class="small">증강</b>${augs}</div>` : ''}
    ${sortTabs(app)}
    <div class="dgrid">${groupCards(sortedDeck(app)).map(([c, k]) => cardInstFace(c, { extra: k > 1 ? `<span class="dcount">×${k}</span>` : '' })).join('')}</div>
  </div></div>`;
}

/** 같은 카드(강화 포함)를 묶어 ×N으로 */
function groupCards(list: CardInst[]): [CardInst, number][] {
  const out: [CardInst, number][] = [];
  for (const c of list) {
    const g = out.find(([x]) => x.id === c.id && x.up === c.up);
    if (g) g[1]++; else out.push([c, 1]);
  }
  return out;
}

/** 증강 선택 */
function augmentModal(app: App): string {
  const run = app.run!;
  const of = run.augmentOffer!;
  const sel = app.ui.rewardSel;
  const counts = tagCounts(run);
  const odds = augmentOdds(run);
  const ti = AUG_TIER_INFO[of.tier];
  const cards = of.ids.map((id, i) => {
    const a = AUGMENT_BY_ID[id];
 return `<div class="augwrap"><button class="augcard t-${a.tier} ${sel === i ? 'sel' : ''} ${sel === null ? 'anim' : ''}" style="animation-delay:${i * 0.1}s" data-act="augSel" data-arg="${i}">
      <span class="augtier">${AUG_TIER_INFO[a.tier].name}</span>
      <span class="augicon">${a.icon}</span>
      <span class="augname">${esc(a.name)}</span>
      ${a.tag ? `<span class="augtag">${TAG_INFO[a.tag].icon} +1</span>` : '<span class="augtag muted">무색</span>'}
      <span class="augdesc">${esc(a.desc)}</span>
    </button>${a.tag ? tagPreview(counts, a.tag) : ''}<button class="augrr" data-act="augReroll" data-arg="${i}" ${canRerollAugment(run, i) ? '' : 'disabled'} data-tip="이 자리만 다시 뽑기 (자리마다 1번, 등급 유지)">🔄 ${of.rerolled[i] ? '사용함' : '다시 뽑기'}</button></div>`;
  }).join('');
  const prism = of.tier === 'gold' && run.flags.prismRolled !== run.flags.augOffers
    ? `<button class="btn ghost prismbtn" data-act="prismRoll" ${run.chips >= PRISM_ROULETTE.chips ? '' : 'disabled'} data-tip="25% 프리즘 / 75% 실버로 다시 뽑기">🎰 프리즘 룰렛 <b>칩 ${PRISM_ROULETTE.chips}</b></button>` : '';
  const owned = run.augments.map((id) => `<span class="aug t-${AUGMENT_BY_ID[id].tier}" data-tip="${esc(AUGMENT_BY_ID[id].name + '\n' + AUGMENT_BY_ID[id].desc)}">${AUGMENT_BY_ID[id].icon}</span>`).join('');
  return `<div class="modal"><div class="box wide augbox t-${of.tier}">
    <h3 class="center" data-tip="${esc(`${odds.label}: 실버 ${odds.w[0]}% · 골드 ${odds.w[1]}% · 프리즘 ${odds.w[2]}%${odds.ceiling ? ' (천장: 프리즘 확정)' : ''}`)}">증강 선택 <span style="color:${ti.color}">${ti.name}</span></h3>
    ${owned ? `<div class="row augrow">${owned}</div>` : ''}
    <div class="augs">${cards}</div>
    ${prism}
    <button class="btn primary big" data-act="augPick" data-arg="${sel ?? -1}" ${sel === null ? 'disabled' : ''}>${sel === null ? '증강을 고르세요' : `「${esc(AUGMENT_BY_ID[of.ids[sel]].name)}」 선택`}</button>
  </div></div>`;
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
  const relics = run.relics.map((id) => itemHtml({ kind: 'relic', id })).join('');
  const cons = run.consumables.map((id, i) => itemHtml({ kind: 'consumable', id }, '', CONSUMABLE_BY_ID[id].when !== 'passive' ? `<button class="btn" data-act="useCons" data-arg="${i}">사용</button>` : '<span class="small">자동</span>')).join('');

  return `<div class="modal"><div class="box">
    <div class="row"><h3 class="grow">🎒 가방</h3><button class="btn ghost" data-act="closeModal" data-always="1">✕</button></div>
    ${relics ? `<b>유물 ${run.relics.length}</b><div class="col">${relics}</div>` : ''}
    ${cons ? `<b>소모품 ${run.consumables.length}/${BALANCE.maxConsumables}</b><div class="col">${cons}</div>` : ''}
    <div class="row"><b class="grow">주사위 ${run.dice.length}</b><button class="linkbtn" data-act="modal" data-arg="hands" data-always="1">재질·족보 ›</button></div>${diceViewer(app, false)}
    <button class="btn" data-act="deck" data-always="1">덱 보기 (${run.deck.length}장)</button>
    <div class="bagfoot"><button data-act="settings" data-always="1">설정</button><button data-act="back" data-always="1">타이틀로</button><button class="warn" data-act="quit" data-always="1">포기</button></div>
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
  if (ui.modal === 'deck') return deckModal(app);
  if (run.augmentOffer && !ui.modal) return augmentModal(app);
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

/** 주사위 눈 범위를 "3·4·5·6" 형태로 */
function faces(lo: number, hi: number): string {
  if (hi < lo) return '없음';
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).join('·');
}

function faceConfirm(app: App, name: string): string {
  const run = app.run!;
  const i = app.ui.pickFace;
  if (i === null) return `<button class="btn primary big" disabled>붙일 면을 고르세요</button>`;
  const die = run.dice[Math.min(app.ui.editDie, run.dice.length - 1)];
  const f = die.faces[i];
  const old = f.sticker ? FACE_BY_ID[f.sticker] : null;
  return `<div class="small center">눈 ${f.pip} 면에 붙인다${old ? ` · <span class="red">기존 ${old.emoji} ${old.name} 스티커는 사라짐</span>` : ''}</div>
    <button class="btn primary big" data-act="confirmFace">✔ 여기에 「${name}」 붙이기</button>`;
}

