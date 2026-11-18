import type { App } from '../app';
import { cardDesc } from '../../data/cards';
import { condText } from '../../data/cond';
import { BUFF_BY_ID } from '../../data/buffs';
import { resolveFor } from '../../rules/cardfx';
import { canBurn } from '../../rules/deck';
import { canCentralBank } from '../../rules/sets';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID, MATERIALS } from '../../data/materials';
import { ENEMY_BY_ID, ENEMY_TRAIT, HOUSE_RULES } from '../../data/enemies';
import { HAND_BY_ID, HANDS } from '../../data/hands';
import { CHAR_BY_ID } from '../../data/characters';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { BALANCE } from '../../data/balance';
import { handDrawPending, cardCost, cardUsable, chipsAvailable, describeIntent, gambleOddsBonus, handChipsFor, hasMoves, lockedCount, lockLimit, previewCard, previewHand, previewPips } from '../../rules/combat';
import { ENEMY_BY_ID as EDEF } from '../../data/enemies';
import { cardInstFace, dieFace, esc, fmt, handDieHtml, pipsHtml } from '../components/parts';
import { topbar } from './common';
import type { Enemy, HandDie } from '../../core/state';


/** 인텐트를 "아이콘 숫자 + 한 단어"로 */
function intentText(e: Enemy): { cls: string; text: string } {
  const it = e.intent;
  const attack = ['attack', 'attackRange', 'multi', 'copy', 'bet', 'houseCopy'].includes(it.k);
  if (attack) return { cls: 'atk', text: `⚔️ ${esc(it.label.replace(/×족보\((\d+)\)/, ' ($1)'))}` };
  if (it.k === 'block') return { cls: 'def', text: `🛡️ ${esc(it.label)} 방어` };
  return { cls: 'util', text: `${it.icon} ${esc(it.label)}` };
}

export function dieInfo(h: HandDie, broken = false): string {
  const parts: string[] = [];
  if (h.gone) parts.push(broken ? '<b class="red">💥 깨짐</b> 1이 나와서 깨졌다 · 이번 전투만 못 씀' : '<b class="red">🦝 빼앗김</b> 이번 턴만 못 씀');
  if (h.material !== 'wood') {
    const m = MATERIAL_BY_ID[h.material];
    parts.push(`<b>${m.icon} ${m.name}</b> ${esc(fmt(m.desc, m.v))}`);
  }
  if (h.sticker) {
    const f = FACE_BY_ID[h.sticker];
    parts.push(`<b>${f.emoji} ${f.name}</b> ${esc(fmt(f.desc, f.v))}`);
  }
  if (h.golden) parts.push('<b class="gold">잭팟 턴</b> 효과 2배');
  return parts.join(' · ');
}

export function combatScreen(app: App): string {
  const run = app.run!;
  const cb = run.combat!;
  const ctx = app.ctx;
  const ui = app.ui;
  const roll = cb.phase === 'roll';

  // ── 딜러석 (적) ──
  const enemies = cb.enemies.map((e) => {
    const def = ENEMY_BY_ID[e.id];
    const it = intentText(e);
    const hpPct = (e.hp / e.maxHp) * 100;
    const st = [
      e.weak ? `<span>❄-${e.weak}</span>` : '',
      e.str ? `<span class="st str" data-tip="💪 힘 ${e.str}: 공격 피해 +${e.str}">💪${e.str}</span>` : '',
      e.vuln ? `<span class="st vuln" data-tip="💔 취약 ${e.vuln}턴: 받는 피해 +50%">💔${e.vuln}</span>` : '',
      e.frail ? `<span class="st frail" data-tip="🥀 약화 ${e.frail}턴: 주는 피해 -25%">🥀${e.frail}</span>` : '',
      e.stacks ? `<span class="red">📈+${e.stacks}</span>` : '',
      e.nextMult > 1 ? `<span class="red">💪×2</span>` : '',
      e.enraged ? `<span class="red">😡</span>` : '',
      e.phase > 1 ? `<span class="red">2P</span>` : '',
      ...cb.buffs.filter((b) => b.owner === e.uid).map((b) => { const d = BUFF_BY_ID[b.id]; return `<span class="st buff" data-tip="${esc(d.icon + ' ' + d.name + ': ' + d.desc(b))}">${d.icon}${b.turns === Infinity ? '' : `<small>${b.turns}</small>`}</span>`; }),
    ].join('');
    // 콜드 리딩: 다다음 행동까지 공개
    const peek = cb.counters.coldread && e.hp > 0 ? (() => { const d = EDEF[e.id]; const sp = d.pattern[(e.patternIdx + 1) % d.pattern.length]; const it2 = describeIntent(ctx, e, sp.k === 'random' ? { k: 'attack', n: 0 } : sp); return `<div class="peek" data-tip="콜드 리딩: 그다음 행동">👁 ${it2.icon} ${esc(it2.label)}</div>`; })() : '';
    const isT = e.uid === cb.target && e.hp > 0 && cb.enemies.filter((x) => x.hp > 0).length > 1;
    return `<div class="enemy ${isT ? 'target' : ''} ${e.hp <= 0 ? 'dead' : ''}" data-uid="${e.uid}" data-act="target" data-arg="${e.uid}" data-tip="${esc(def.name + (def.desc ? ': ' + def.desc : ''))}">
      <div class="intent ${it.cls}">${it.text}</div>${peek}
      <div class="em">${e.emoji}</div>
      <div class="pips2"><span class="weakpip" data-tip="약점 눈: ${e.weakPip}이(가) 들어간 주사위로 공격하면 피해 ×${BALANCE.weakMult}">🎯<b>${e.weakPip}</b></span>${e.immunePip ? `<span class="immpip" data-tip="면역 눈: ${e.immunePip}(으)로 준 피해를 받지 않습니다">🚫<b>${e.immunePip}</b></span>` : ''}</div>
      ${e.poison ? `<div class="poisonbadge" data-tip="중독: 적의 턴마다 ${e.poison} 피해를 받고, 독이 1 줄어듭니다.">🧪 독 ${e.poison}</div>` : ''}
      <div class="ehp ${e.block && e.hp > 0 ? 'shielded' : ''}" data-hpk="e${e.uid}" data-pct="${hpPct}">${e.block && e.hp > 0 ? `<span class="eshb" data-blk="${e.block}" data-tip="방어도 ${e.block}: 체력보다 먼저 피해를 막습니다. 이 적의 다음 행동 때 사라집니다."><span class="n">${e.block}</span></span>` : ''}<span class="hpc"><s class="trail"></s><i style="width:${hpPct}%;${e.poison && e.hp > 0 ? `--pa:${(Math.max(0, e.hp - e.poison) / e.hp) * 100}%` : ''}"></i></span><b>${e.hp}/${e.maxHp}</b></div>
      <div class="name">${esc(e.name)}${st ? ` <span class="status">${st}</span>` : ''}</div>
      ${ENEMY_TRAIT[e.id] && e.hp > 0 ? `<button class="etrait" data-act="enemyInfo" data-arg="${e.uid}" data-tip="${esc(`${ENEMY_TRAIT[e.id]}: ${def.desc ?? ''}`)}">${esc(ENEMY_TRAIT[e.id])} <b>?</b></button>` : ''}
    </div>`;
  }).join('');

  // ── 족보 ──
  const hr = cb.handResult ?? (roll ? previewHand(ctx) : null);
  const handbar = hr ? `<button class="handbar ${hr.id === 'none' ? 'nohand' : ''}" data-act="modal" data-arg="hands">
      <span class="hname">${hr.name}</span><span class="hmult">×${hr.mult.toFixed(1)}</span><span class="hchip">🔶${handChipsFor(ctx, hr.id)}</span>${handDrawPending(ctx, hr.id) ? '<span class="hdraw" data-tip="투 페어 이상: 족보가 확정되면 카드 1장을 더 뽑습니다">🂠+1</span>' : ''}<span class="hq">?</span>
    </button>` : '<div class="handbar"></div>';

  const rules = cb.houseRule ? esc(HOUSE_RULES[cb.houseRule].replace('하우스 룰: ', '🎩 ')) : cb.queenParity ? `👸 이번 턴 ${cb.queenParity === 'odd' ? '홀수' : '짝수'} 눈만 피해` : '';

  // ── 주사위 ──
  const selKeys = roll ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : ui.sel;
  const tray = cb.hand.map((h) => {
    const sel = roll ? h.locked : ui.sel.includes(h.key);
    const cls = `${h.used ? 'used' : ''} ${h.gone ? 'broken' : ''} ${roll && h.locked ? 'locked' : ''} ${!roll && sel ? 'sel' : ''} ${ui.infoKey === h.key ? 'info' : ''}`;
    const lock = h.gone ? '<span class="crack">💥</span>' : roll && h.locked ? '<span class="lock">🔒</span>' : '';
    return handDieHtml(h, cls, `data-key="${h.key}" data-act="die" data-arg="${h.key}"`).replace(/<\/div>$/, `${lock}</div>`);
  }).join('');
  const infoDie = cb.hand.find((h) => h.key === ui.infoKey && (!h.used || h.gone));
  const info = infoDie ? dieInfo(infoDie, cb.brokenDice.includes(infoDie.dieIdx)) : '';

  const chipsNow = chipsAvailable(ctx);
  const chips = cb.handChips;
  const chipGain = roll && !cb.turnCounters.confirmed ? handChipsFor(ctx, previewHand(ctx).id) : 0;
  // ── 카드 손패 (예상 효과 숫자) ──
  const n = cb.cards.length;
  const oddsB = gambleOddsBonus(ctx);
  const cards = cb.cards.map((inst, i) => {
    const def = resolveFor(run, inst);
    const usable = cardUsable(ctx, i);
    const pv = usable ? previewCard(ctx, i, selKeys) : null;
    const ready = !!pv?.keys;
    const cost = cardCost(ctx, inst);
    let badge = '';
    if (pv?.keys) {
      if (pv.chance) badge = '<span class="pvb">🎲?</span>';
      else if (pv.dmg || pv.blocked) badge = `<span class="pvb dmg" title="">⚔${pv.dmg}${pv.blocked ? `<small>🛡${pv.blocked}</small>` : ''}</span>`;
      else if (pv.block) badge = `<span class="pvb blk">🛡${pv.block}</span>`;
      else if (pv.heal) badge = `<span class="pvb heal">❤${pv.heal}</span>`;
      else if (pv.gold) badge = `<span class="pvb gold">🪙${pv.gold}</span>`;
      else if (pv.piggy) badge = `<span class="pvb gold">🐷${pv.piggy}</span>`;
      else if (pv.draw) badge = `<span class="pvb">🂠+${pv.draw}</span>`;
    }
    const state = ready ? 'ready' : 'off';
    const mid = (n - 1) / 2;
    const tilt = n > 7 ? 1.2 : n > 5 ? 2 : 3;
    const rot = (i - mid) * tilt;
    const lift = Math.abs(i - mid) * (n > 6 ? 1.2 : 2.5);
    const desc = cardDesc(def, oddsB);
    const cond = def.cond.k === 'instant' ? '즉발' : condText(def.cond);
    return `<div class="scard r-${def.rarity} ${state} ${def.unplayable ? 'cursed' : ''} ${ui.selCard === i ? 'chosen' : ''}" data-cuid="${inst.uid}" data-card="${i}" data-act="cardTap" data-arg="${i}" style="--rot:${rot}deg;--lift:${lift}px;z-index:${10 + i}" data-tip="${esc(`${def.name}${inst.up ? '+' + inst.up : ''} — ${cond}: ${desc}${def.exhaust ? ' (소멸)' : ''}${def.unplayable ? '' : def.target === 'enemy' ? ' (적에게 끌어다 놓기)' : ' (테이블에 끌어다 놓기)'}`)}">
      <span class="ccost ${cost > chipsNow ? 'short' : ''} ${cost < def.cost ? 'cheap' : ''}">${def.unplayable ? '✕' : cost}</span><span class="ccond">${esc(cond)}</span>${badge}
      ${inst.up ? `<span class="cup">${inst.up}</span>` : ''}
      <div class="cart">${def.icon}</div>
      <div class="cname">${esc(def.name)}${inst.up ? `<span class="green">+</span>` : ''}</div>
      <div class="cdesc">${esc(desc)}</div>
      <span class="ctgt">${def.unplayable ? '' : def.target === 'enemy' ? '🎯' : '✋'}</span>
    </div>`;
  }).join('');
  const W = 312; // 손패가 차지할 폭 (회전 여유 포함)
  const cw = n <= 5 ? 74 : Math.max(46, Math.floor(W / n) + 10);
  const cm = n <= 5 ? -4 : -Math.max(4, Math.ceil((cw * n - W) / (2 * n)));
  const piles = `<div class="piles">
    <button class="pile" data-act="pile" data-arg="draw" data-tip="뽑을 카드">🂠 <b>${cb.drawPile.length}</b></button>
    ${cb.exhausted.length ? `<button class="pile" data-act="pile" data-arg="exhaust" data-tip="소멸한 카드 (이번 전투)">🔥 <b>${cb.exhausted.length}</b></button>` : ''}
    <button class="pile" data-act="pile" data-arg="discard" data-tip="버린 카드">🗑 <b>${cb.discard.length}</b></button>
  </div>`;
  const pBuffs = cb.buffs.filter((b) => b.owner === 'player').map((b) => { const d = BUFF_BY_ID[b.id]; return `<span class="st buff" data-tip="${esc(d.icon + ' ' + d.name + ': ' + d.desc(b))}">${d.icon}${b.value > 1 && b.value < 100 ? b.value : ''}${b.turns === Infinity ? '' : `<small>(${b.turns})</small>`}</span>`; }).join('');

  // ── 플레이어 패널 ──
  const ch = CHAR_BY_ID[run.charId];
  const hpPct = Math.max(0, (run.hp / run.maxHp) * 100);
  const blk = cb.block + cb.keepBlock;
  const cons = Array.from({ length: BALANCE.maxConsumables }, (_, i) => {
    const id = run.consumables[i];
    if (!id) return '';
    const d = CONSUMABLE_BY_ID[id];
    return `<button class="cbtn" data-act="useCons" data-arg="${i}" data-tip="${esc(d.name + ': ' + d.desc)}">${d.emoji}</button>`;
  }).join('');
  const pvs = previewPips(ctx);
  const tools = [
    canBurn(ctx) ? `<button class="cbtn tool burn" data-act="openBurn" data-tip="🔥 주사위 태우기: 턴당 1번, 쓰지 않은 주사위 하나를 버리고 카드 1장 뽑기">🔥</button>` : '',
    canCentralBank(ctx) ? `<button class="cbtn tool" data-act="openBank" data-tip="🏦 중앙은행: 저금통에서 꺼내 1골드당 1 피해 (턴당 1번)">🏦</button>` : '',
    (cb.turnCounters.setValue ?? 0) > 0 ? `<button class="cbtn tool" data-act="openSet" data-tip="원하는 눈으로 바꾸기">✋${cb.turnCounters.setValue}</button>` : '',
    (cb.turnCounters.nudge ?? 0) > 0 ? `<button class="cbtn tool" data-act="openNudge" data-tip="눈 ±1">👆</button>` : '',
    pvs.length ? `<span class="preview-chip" data-tip="다음 턴 첫 굴림 미리보기">👁${pvs.join('·')}</span>` : '',
  ].join('');

  const moves = hasMoves(ctx);
  return `${topbar(app)}
  <div class="screen noscroll combat ${app.veil ? 'enemyphase' : ''}">
    <div class="table" data-act="field">
      <div class="enemies n${cb.enemies.filter((x) => x.hp > 0).length}">${enemies}</div>
      ${rules ? `<div class="rulechip">${rules}</div>` : ''}
      ${handbar}
      <div class="tray ${app.veil ? 'veiled' : ''} ${(cb.turnCounters.yahtzee || (roll && previewHand(ctx).id === 'yahtzee')) && !app.veil ? 'yahtzee' : ''} ${cb.hand.length > 5 ? 'many' : ''} ${cb.hand.length > 6 ? 'lots' : ''}">${tray}</div>
      <div class="tablestats">
        <span data-tip="리롤: 잠그지 않은 주사위를 다시 굴림">🎲 <b>${roll ? cb.rerollsLeft : 0}</b></span>
        <span data-tip="잠금: 한 번에 잠글 수 있는 주사위 수">🔒 <b>${roll ? lockedCount(cb) : 0}/${lockLimit(ctx)}</b></span>
        <span data-tip="안 쓴 주사위 눈이 모여 전투 후 골드가 된다">🐷 <b>${cb.piggy}</b></span>${tools}</div>
    </div>
    <div class="player">
      <span class="pav" data-tip="${esc(ch.name + ': ' + ch.desc)}">${ch.emoji}</span>
      <div class="hpbar" data-hpk="p" data-pct="${hpPct}"><s class="trail"></s><i style="width:${hpPct}%"></i><b>❤ <span class="hpval">${run.hp}</span>/${run.maxHp}</b></div>
      <div class="chiporb chipstat ${chipsNow === 0 ? 'empty' : ''}" data-tip="🔶 족보 칩 = 카드 비용\n족보로 얻고, 남은 칩은 ${BALANCE.chipCarryMax}개까지 이월">
        <span class="onum">${chipsNow}</span><span class="olbl">🔶 칩</span>${chipGain ? `<span class="ogain">족보 +${chipGain}</span>` : ''}</div>
      ${cb.pStr ? `<span class="st str" data-tip="💪 힘 ${cb.pStr}: 공격할 때마다 피해 +${cb.pStr}">💪${cb.pStr}</span>` : ''}${pBuffs}
      ${cb.pWeak ? `<span class="st frail" data-tip="🥀 약화 ${cb.pWeak}턴: 내가 주는 피해 -25%">🥀${cb.pWeak}</span>` : ''}
      ${cb.pVuln ? `<span class="st vuln" data-tip="💔 취약 ${cb.pVuln}턴: 내가 받는 피해 +50%">💔${cb.pVuln}</span>` : ''}
      <span class="pblock ${blk ? '' : 'zero'}" data-tip="방어도: 적의 공격을 먼저 막는다 (다음 내 턴에 사라짐)">🛡${blk}</span>
      ${cons}
    </div>
    <div class="dieinfo">${info || (ui.selCard !== null && cb.cards[ui.selCard] ? (() => { const d = resolveFor(run, cb.cards[ui.selCard]); return `<b>${esc(d.name)}</b> ${esc(cardDesc(d, oddsB))} · ${d.target === 'enemy' ? '🎯 적을 탭' : '✋ 위쪽을 탭'}`; })() : roll ? '🔒 탭해서 잠금 · 카드는 <b>끌어다 놓기</b>' : '🎯 카드 → 적 · ✋ 카드 → 위로')}</div>
    <div class="handrow">${piles}<div class="hand n${Math.min(n, 6)} ${n > 6 ? 'many' : ''}" style="--cw:${cw}px;--cm:${cm}px">${cards || '<span class="muted small">손패가 비었다</span>'}</div></div>
    <div class="actions">
      <button class="btn" data-act="reroll" ${roll && cb.rerollsLeft > 0 ? '' : 'disabled'}>🎲 리롤 ${roll ? cb.rerollsLeft : 0}</button>
      <button class="btn" data-act="modal" data-arg="hands">📖 도움말</button>
      <button class="btn primary ${moves ? '' : 'glow'}" data-act="endTurn">턴 종료 ▶</button>
    </div>
  </div>
  ${pickerModal(app)}`;
}

export function handsModal(app: App): string {
  const cb = app.run?.combat;
  const tab = app.ui.helpTab;
  const tabs = `<div class="tabs"><button class="${tab === 'hands' ? 'on' : ''}" data-act="helpTab" data-arg="hands">🃏 족보</button><button class="${tab === 'dice' ? 'on' : ''}" data-act="helpTab" data-arg="dice">🎲 주사위 재질</button></div>`;
  let body = '';
  if (tab === 'hands') {
    const cur = cb ? (cb.handResult ?? (cb.phase === 'roll' ? previewHand(app.ctx) : null)) : null;
    body = `<div class="small muted">족보 = 이번 턴 효과 <b>×배율</b> + <b>🔶 칩</b> (남으면 ${BALANCE.chipCarryMax}개까지 이월)</div>
    <div class="col" style="gap:4px">${[...HANDS].reverse().map((h) => `<div class="hrow ${cur?.id === h.id ? 'cur' : ''}">
      <div class="hdice">${h.example.map((p) => `<div class="die tiny">${pipsHtml(p)}</div>`).join('')}</div>
      <div class="grow"><b>${h.name}</b><div class="muted small">${h.how}</div></div>
      <b class="gold">×${h.mult}</b><span class="hchip">🔶${h.chips}</span>
    </div>`).join('')}</div>`;
  } else {
    const owned = new Set(app.run?.dice.map((d) => d.material) ?? []);
    body = `<div class="small muted">주사위 왼쪽 아래 아이콘 = 재질 · <b>내 것</b> = 보유 중</div>
    <div class="col" style="gap:4px">${MATERIALS.map((m) => `<div class="hrow ${owned.has(m.id) ? 'cur' : ''}">
      <div class="die small mat-${m.id}" style="flex-shrink:0">${pipsHtml(5)}${m.id !== 'wood' ? `<span class="matb">${m.icon}</span>` : ''}</div>
      <div class="grow"><b>${m.icon} ${m.name}</b>${owned.has(m.id) ? ' <span class="tag rare">내 것</span>' : ''}<div class="small">${esc(m.long)}</div></div>
    </div>`).join('')}</div>`;
  }
  return `<div class="modal"><div class="box">
    <div class="row"><h3 class="grow">📖 도움말</h3><button class="btn ghost" data-act="closeModal">✕</button></div>
    ${tabs}${body}
  </div></div>`;
}

const TUT = [
  { e: '🎲', t: '주사위로 싸운다', d: '매 턴 주사위 5개가 굴러간다. 위쪽은 적(딜러), 아래쪽이 나다.' },
  { e: '🔒', t: '잠그고 다시 굴리기', d: '마음에 드는 주사위를 탭하면 잠긴다.\n🎲 리롤을 누르면 나머지만 다시 굴린다 (턴당 2번).' },
  { e: '🃏', t: '족보 = 배율', d: '같은 눈, 이어지는 눈을 모으면 족보!\n배율만큼 모든 효과가 세진다. 📖 족보 버튼으로 언제든 확인.' },
  { e: '🃏', t: '카드를 끌어다 쓰기', d: '아래 스킬 카드를 끌어서 놓으면 알맞은 주사위로 발동!\n🎯 공격 카드는 적 위에, ✋ 방어·회복 카드는 테이블 아무 곳에.\n카드 위 숫자가 예상 결과 (⚔ 피해, 🛡 방어)' },
  { e: '👀', t: '적의 다음 행동', d: '적 머리 위 ⚔️ 숫자만큼 이번 턴 끝에 공격해 온다.\n🛡 방어로 막고, 남은 주사위는 🐷 저금통 → 골드.\n할 게 없으면 턴 종료 버튼이 반짝인다.' },
];

export function tutorialModal(app: App): string {
  const i = app.ui.tut - 1;
  const s = TUT[i];
  if (!s) return '';
  return `<div class="modal"><div class="box center tutbox">
    <div class="tutemo">${s.e}</div>
    <h2>${s.t}</h2>
    <div class="tuttext">${esc(s.d).replace(/\n/g, '<br>')}</div>
    <div class="dots">${TUT.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row center"><button class="btn ghost" data-act="tutSkip">건너뛰기</button><button class="btn primary grow" data-act="tutNext">${i === TUT.length - 1 ? '시작!' : '다음 ▶'}</button></div>
  </div></div>`;
}

function pickerModal(app: App): string {
  const p = app.ui.picker;
  const run = app.run!;
  const cb = run.combat!;
  if (!p) return '';
  const card = p.slot !== undefined && cb.cards[p.slot] ? resolveFor(run, cb.cards[p.slot]) : null;
  const titles: Record<string, string> = {
    fate: '🔮 바꿀 주사위 → 원하는 눈', set: '✋ 바꿀 주사위 → 원하는 눈', nudge: '👆 주사위 고르고 ±1',
    value: `${card?.icon ?? ''} ${card?.name ?? ''}: 눈 고르기`, otherDie: `${card?.icon ?? ''} ${card?.name ?? ''}: 맞바꿀 주사위`,
    pile: `${card?.icon ?? ''} ${card?.name ?? ''}: 가져올 카드`, burn: '🔥 태울 주사위 (카드 1장 뽑기)', bank: '🏦 중앙은행: 꺼낼 금액',
  };
  let body = '';
  if (['fate', 'set', 'nudge', 'otherDie', 'burn'].includes(p.mode)) {
    const dice = cb.hand.filter((h) => !h.used && !(p.keys ?? []).includes(h.key)).map((h) =>
      dieFace(h.pip, h.sticker, h.material, p.target === h.key ? 'sel' : '', `data-act="pickerDie" data-arg="${h.key}"`)).join('');
    body = `<div class="tray">${dice || '<span class="muted">대상 주사위가 없다</span>'}</div>`;
  }
  let vals = '';
  if (p.mode === 'value') vals = (p.values ?? []).map((v) => `<button class="btn" data-act="pickerVal" data-arg="${v}">${v}</button>`).join('');
  else if (p.mode === 'pile') {
    const top = cb.drawPile.slice(0, card?.n.k ?? 3);
    body = `<div class="dgrid">${top.map((c) => cardInstFace(c, { attrs: `data-act="pickerVal" data-arg="${c.uid}"`, cls: 'pick' })).join('') || '<span class="muted">뽑을 카드가 없다</span>'}</div>`;
    if (!top.length) vals = '<button class="btn primary" data-act="pickerVal" data-arg="0">그냥 쓰기</button>';
  } else if (p.mode === 'bank') {
    vals = [10, 25, 50].filter((x) => x < cb.piggy).concat([cb.piggy]).map((v) => `<button class="btn" data-act="pickerVal" data-arg="${v}">${v === cb.piggy ? `전부 ${v}` : v}</button>`).join('');
  } else if (p.target !== undefined) {
    if (p.mode === 'nudge') vals = `<button class="btn" data-act="pickerVal" data-arg="-1">-1</button><button class="btn" data-act="pickerVal" data-arg="1">+1</button>`;
    else if (p.mode === 'otherDie' || p.mode === 'burn') vals = `<button class="btn primary" data-act="pickerVal" data-arg="0">✔ 확정</button>`;
    else vals = [1, 2, 3, 4, 5, 6].map((v) => `<button class="btn" data-act="pickerVal" data-arg="${v}">${v}</button>`).join('');
  }
  return `<div class="modal"><div class="box">
    <h3>${titles[p.mode] ?? ''}</h3>
    ${body}
    <div class="row center" style="flex-wrap:wrap">${vals}</div>
    <button class="btn ghost" data-act="cancelPicker">취소</button>
  </div></div>`;
}
