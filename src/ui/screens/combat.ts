import type { App } from '../app';
import { condText, SKILL_BY_ID } from '../../data/skills';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { ENEMY_BY_ID, HOUSE_RULES } from '../../data/enemies';
import { HAND_BY_ID, HANDS } from '../../data/hands';
import { CHAR_BY_ID } from '../../data/characters';
import { CONSUMABLE_BY_ID } from '../../data/consumables';
import { BALANCE } from '../../data/balance';
import { hasMoves, previewHand, previewPip, previewSkill, skillUsable } from '../../rules/combat';
import { dieFace, esc, fmt, handDieHtml, pipsHtml } from '../components/parts';
import { topbar } from './common';
import type { Enemy, HandDie } from '../../core/state';

const ROLE_ICON: Record<string, string> = { atk: '⚔️', def: '🛡️', eco: '💰', util: '✨' };

/** 인텐트를 "아이콘 숫자 + 한 단어"로 */
function intentText(e: Enemy): { cls: string; text: string } {
  const it = e.intent;
  const attack = ['attack', 'attackRange', 'multi', 'copy', 'bet', 'houseCopy'].includes(it.k);
  if (attack) return { cls: 'atk', text: `⚔️ ${esc(it.label.replace(/×족보\((\d+)\)/, ' ($1)'))}` };
  if (it.k === 'block') return { cls: 'def', text: `🛡️ ${esc(it.label)} 방어` };
  return { cls: 'util', text: `${it.icon} ${esc(it.label)}` };
}

export function dieInfo(h: HandDie): string {
  const parts: string[] = [];
  if (h.material !== 'wood') {
    const m = MATERIAL_BY_ID[h.material];
    parts.push(`<b>${m.name} 주사위</b> ${esc(fmt(m.desc, m.v))}`);
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
      e.block ? `<span class="blk">🛡${e.block}</span>` : '',
      e.poison ? `<span class="green">☠${e.poison}</span>` : '',
      e.weak ? `<span>❄-${e.weak}</span>` : '',
      e.stacks ? `<span class="red">📈+${e.stacks}</span>` : '',
      e.nextMult > 1 ? `<span class="red">💪×2</span>` : '',
      e.enraged ? `<span class="red">😡</span>` : '',
      e.phase > 1 ? `<span class="red">2P</span>` : '',
    ].join('');
    const isT = e.uid === cb.target && e.hp > 0 && cb.enemies.filter((x) => x.hp > 0).length > 1;
    return `<div class="enemy ${isT ? 'target' : ''} ${e.hp <= 0 ? 'dead' : ''}" data-uid="${e.uid}" data-act="target" data-arg="${e.uid}" data-tip="${esc(def.name + (def.desc ? ': ' + def.desc : ''))}">
      <div class="intent ${it.cls}">${it.text}</div>
      <div class="em">${e.emoji}</div>
      <div class="ehp"><i style="width:${hpPct}%"></i><b>${e.hp}</b></div>
      <div class="name">${esc(e.name)}${st ? ` <span class="status">${st}</span>` : ''}</div>
    </div>`;
  }).join('');

  // ── 족보 ──
  const hr = cb.handResult ?? (roll ? previewHand(ctx) : null);
  const handbar = hr ? `<button class="handbar ${hr.id === 'none' ? 'nohand' : ''}" data-act="modal" data-arg="hands">
      <span class="hname">${hr.name}</span><span class="hmult">×${hr.mult.toFixed(1)}</span><span class="hq">?</span>
    </button>` : '<div class="handbar"></div>';

  const rules = cb.houseRule ? esc(HOUSE_RULES[cb.houseRule].replace('하우스 룰: ', '🎩 ')) : cb.queenParity ? `👸 이번 턴 ${cb.queenParity === 'odd' ? '홀수' : '짝수'} 눈만 피해` : '';

  // ── 주사위 ──
  const selKeys = roll ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : ui.sel;
  const tray = cb.hand.map((h) => {
    const sel = roll ? h.locked : ui.sel.includes(h.key);
    const cls = `${h.used ? 'used' : ''} ${roll && h.locked ? 'locked' : ''} ${!roll && sel ? 'sel' : ''} ${h.material !== 'wood' || h.sticker ? 'special' : ''}`;
    const lock = roll && h.locked ? '<span class="lock">🔒</span>' : '';
    return handDieHtml(h, cls, `data-key="${h.key}" data-act="die" data-arg="${h.key}"`).replace(/<\/div>$/, `${lock}</div>`);
  }).join('');
  const infoDie = cb.hand.find((h) => h.key === ui.infoKey && !h.used);
  const info = infoDie ? dieInfo(infoDie) : '';

  // ── 스킬 카드 (예상 효과 숫자) ──
  const skills = Array.from({ length: run.maxSlots }, (_, i) => {
    const s = run.skills[i];
    if (!s) return `<div class="skill empty">빈 칸</div>`;
    const def = SKILL_BY_ID[s.id];
    const usable = !cb.usedSlots[i] && skillUsable(ctx, i);
    const pv = usable ? previewSkill(ctx, i, selKeys) : null;
    const ready = !!pv?.keys;
    let big = '';
    let small = '';
    if (pv?.keys) {
      if (pv.chance) big = '<span class="pv">🎲?</span>';
      else {
        const parts: string[] = [];
        if (pv.dmg) parts.push(`<span class="pv dmg">⚔${pv.dmg}</span>`);
        if (pv.block) parts.push(`<span class="pv blk">🛡${pv.block}</span>`);
        if (pv.heal) parts.push(`<span class="pv heal">❤${pv.heal}</span>`);
        if (pv.gold) parts.push(`<span class="pv gold">🪙${pv.gold}</span>`);
        if (pv.piggy) parts.push(`<span class="pv gold">🐷${pv.piggy}</span>`);
        big = parts[0] ?? '<span class="pv">✨</span>';
        small = parts[1] ?? '';
      }
    }
    const state = cb.usedSlots[i] ? 'used' : ready ? 'ready' : 'off';
    return `<button class="skill r-${def.rarity} ${state}" data-act="slot" data-arg="${i}" data-tip="${esc(def.name + ' — ' + condText(def.cond) + ' 주사위: ' + fmt(def.desc, def.v))}">
      <span class="srow"><span class="sn">${ROLE_ICON[def.role]} ${esc(def.name)}${s.up ? `<span class="green small">+${Math.round(s.up * 100)}%</span>` : ''}</span>${big}</span>
      <span class="srow"><span class="cond">${esc(condText(def.cond))}</span>${small ? small.replace('class="pv', 'class="pv small2') : `<span class="sd">${cb.usedSlots[i] ? '사용함' : esc(fmt(def.desc, def.v))}</span>`}</span>
    </button>`;
  }).join('');

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
  const pv = previewPip(ctx);
  const tools = [
    (cb.turnCounters.setValue ?? 0) > 0 ? `<button class="cbtn tool" data-act="openSet" data-tip="원하는 눈으로 바꾸기">✋${cb.turnCounters.setValue}</button>` : '',
    (cb.turnCounters.nudge ?? 0) > 0 ? `<button class="cbtn tool" data-act="openNudge" data-tip="눈 ±1">👆</button>` : '',
    pv !== null ? `<span class="preview-chip" data-tip="다음 턴 첫 주사위">👁${pv}</span>` : '',
  ].join('');

  const moves = hasMoves(ctx);
  return `${topbar(app)}
  <div class="screen noscroll combat ${app.veil ? 'enemyphase' : ''}">
    <div class="table">
      <div class="felt-print">THE HOUSE · DICE PAYS ×7</div>
      <div class="enemies">${enemies}</div>
      ${rules ? `<div class="rulechip">${rules}</div>` : ''}
      ${handbar}
      <div class="tray ${app.veil ? 'veiled' : ''} ${cb.hand.length > 5 ? 'many' : ''}">${tray}</div>
      <div class="tablestats"><span data-tip="리롤: 잠그지 않은 주사위를 다시 굴림">🎲 리롤 <b>${roll ? cb.rerollsLeft : 0}</b></span><span data-tip="안 쓴 주사위 눈이 모여 전투 후 골드가 된다">🐷 <b>${cb.piggy}</b></span>${tools}</div>
    </div>
    <div class="player">
      <span class="pav" data-tip="${esc(ch.name + ': ' + ch.desc)}">${ch.emoji}</span>
      <div class="hpbar"><i style="width:${hpPct}%"></i><b>❤ <span class="hpval">${run.hp}</span>/${run.maxHp}</b></div>
      <span class="pblock ${blk ? '' : 'zero'}" data-tip="방어도: 적의 공격을 먼저 막는다 (다음 내 턴에 사라짐)">🛡${blk}</span>
      ${cons}
    </div>
    <div class="dieinfo">${info || (roll ? '주사위를 탭해 <b>🔒잠그고</b> 리롤 · 스킬을 탭해 사용' : '주사위를 고르고 <b>스킬</b>을 탭 · 남은 주사위는 🐷')}</div>
    <div class="skills ${run.maxSlots > 4 ? 'many' : ''}">${skills}</div>
    <div class="actions">
      <button class="btn" data-act="reroll" ${roll && cb.rerollsLeft > 0 ? '' : 'disabled'}>🎲 리롤 ${roll ? cb.rerollsLeft : 0}</button>
      <button class="btn" data-act="modal" data-arg="hands">📖 족보</button>
      <button class="btn primary ${moves ? '' : 'glow'}" data-act="endTurn">턴 종료 ▶</button>
    </div>
  </div>
  ${pickerModal(app)}`;
}

export function handsModal(app: App): string {
  const cb = app.run?.combat;
  const cur = cb ? (cb.handResult ?? (cb.phase === 'roll' ? previewHand(app.ctx) : null)) : null;
  const rows = [...HANDS].reverse().map((h) => `<div class="hrow ${cur?.id === h.id ? 'cur' : ''}">
      <div class="hdice">${h.example.map((p) => `<div class="die tiny">${pipsHtml(p)}</div>`).join('')}</div>
      <div class="grow"><b>${h.name}</b><div class="muted small">${h.how}</div></div>
      <b class="gold">×${h.mult}</b>
    </div>`).join('');
  return `<div class="modal"><div class="box">
    <div class="row"><h3 class="grow">📖 족보표</h3><button class="btn ghost" data-act="closeModal">✕</button></div>
    <div class="small muted">주사위 5개로 만든 족보 하나가 이번 턴 <b>모든 공격·방어·골드</b>에 배율로 곱해진다. 높은 족보가 나오면 🔥열기도 오른다.</div>
    <div class="col" style="gap:4px">${rows}</div>
  </div></div>`;
}

const TUT = [
  { e: '🎲', t: '주사위로 싸운다', d: '매 턴 주사위 5개가 굴러간다. 위쪽은 적(딜러), 아래쪽이 나다.' },
  { e: '🔒', t: '잠그고 다시 굴리기', d: '마음에 드는 주사위를 탭하면 잠긴다.\n🎲 리롤을 누르면 나머지만 다시 굴린다 (턴당 2번).' },
  { e: '🃏', t: '족보 = 배율', d: '같은 눈, 이어지는 눈을 모으면 족보!\n배율만큼 모든 효과가 세진다. 📖 족보 버튼으로 언제든 확인.' },
  { e: '⚔️', t: '스킬 누르기', d: '스킬 카드를 탭하면 알맞은 주사위로 바로 발동!\n카드 오른쪽 큰 숫자가 예상 결과다.\n⚔ 빨강 = 적에게 줄 피해, 🛡 파랑 = 내 방어' },
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
  const cb = app.run!.combat!;
  if (!p) return '';
  const title = p.mode === 'fate' ? '🔮 바꿀 주사위 → 원하는 눈' : p.mode === 'set' ? '✋ 바꿀 주사위 → 원하는 눈' : '👆 주사위 고르고 ±1';
  const dice = cb.hand.filter((h) => !h.used && !(p.keys ?? []).includes(h.key)).map((h) =>
    dieFace(h.pip, h.sticker, h.material, p.target === h.key ? 'sel' : '', `data-act="pickerDie" data-arg="${h.key}"`)).join('');
  let vals = '';
  if (p.target !== undefined) {
    vals = p.mode === 'nudge'
      ? `<button class="btn" data-act="pickerVal" data-arg="-1">-1</button><button class="btn" data-act="pickerVal" data-arg="1">+1</button>`
      : [1, 2, 3, 4, 5, 6].map((v) => `<button class="btn" data-act="pickerVal" data-arg="${v}">${v}</button>`).join('');
  }
  return `<div class="modal"><div class="box">
    <h3>${title}</h3>
    <div class="tray">${dice || '<span class="muted">대상 주사위가 없다</span>'}</div>
    <div class="row center" style="flex-wrap:wrap">${vals}</div>
    <button class="btn ghost" data-act="cancelPicker">취소</button>
  </div></div>`;
}
