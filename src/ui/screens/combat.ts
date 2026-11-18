import type { App } from '../app';
import { condText, SKILL_BY_ID } from '../../data/skills';
import { FACE_BY_ID } from '../../data/faces';
import { MATERIAL_BY_ID } from '../../data/materials';
import { ENEMY_BY_ID, HOUSE_RULES } from '../../data/enemies';
import { HAND_BY_ID } from '../../data/hands';
import { canUse, previewHand, previewPip, skillUsable, freeDice } from '../../rules/combat';
import { dieFace, esc, fmt, handDieHtml, rarityTag } from '../components/parts';
import { consumablesRow, topbar } from './common';
import type { HandDie } from '../../core/state';

const TUTORIAL = [
  '',
  '① 주사위를 탭하면 🔒잠금. 잠그지 않은 주사위만 🎲리롤 된다. 족보(페어·스트레이트…)를 노려보자!',
  '② 주사위를 고르고 스킬 칸을 탭하면 발동. 빈 선택으로 스킬을 탭하면 알맞은 주사위를 자동 선택한다.',
  '③ 쓰지 않은 주사위의 눈은 🐷저금통에 쌓여 전투 후 골드가 된다. 적의 다음 행동(인텐트)을 보고 방어하자.',
];

function dieTip(app: App, h: HandDie): string {
  const parts = [`눈 ${h.pip}`];
  if (h.material !== 'wood') { const m = MATERIAL_BY_ID[h.material]; parts.push(`${m.name}: ${fmt(m.desc, m.v)}`); }
  if (h.sticker) { const f = FACE_BY_ID[h.sticker]; parts.push(`${f.name} 면: ${fmt(f.desc, f.v)}`); }
  if (h.golden) parts.push('잭팟 턴: 효과 계산 시 눈 ×2');
  void app;
  return parts.join('\n');
}

export function combatScreen(app: App): string {
  const run = app.run!;
  const cb = run.combat!;
  const ctx = app.ctx;
  const ui = app.ui;
  const roll = cb.phase === 'roll';

  const enemies = cb.enemies.map((e) => {
    const def = ENEMY_BY_ID[e.id];
    const it = e.intent;
    const cls = ['block'].includes(it.k) ? 'def' : ['attack', 'attackRange', 'multi', 'copy', 'bet', 'houseCopy'].includes(it.k) ? '' : 'util';
    const hpPct = (e.hp / e.maxHp) * 100;
    const st = [
      e.block ? `<span class="blk">🛡${e.block}</span>` : '',
      e.poison ? `<span class="green">☠${e.poison}</span>` : '',
      e.weak ? `<span>❄-${e.weak}</span>` : '',
      e.stacks ? `<span class="red">📈+${e.stacks}</span>` : '',
      e.nextMult > 1 ? `<span class="red">💪×${e.nextMult}</span>` : '',
      e.enraged ? `<span class="red">😡</span>` : '',
      e.phase > 1 ? `<span class="red">2P</span>` : '',
    ].join('');
    return `<div class="enemy ${e.uid === cb.target && e.hp > 0 ? 'target' : ''} ${e.hp <= 0 ? 'dead' : ''}" data-uid="${e.uid}" data-act="target" data-arg="${e.uid}" data-tip="${esc(def.name + (def.desc ? ': ' + def.desc : ''))}">
      <div class="intent ${cls}">${it.icon} ${esc(it.label)}</div>
      <div class="em">${e.emoji}</div>
      <div class="name">${esc(e.name)}</div>
      <div class="hpbar" style="height:10px;min-width:0"><i style="width:${hpPct}%"></i><b>${e.hp}/${e.maxHp}</b></div>
      <div class="status">${st}</div>
    </div>`;
  }).join('');

  // 족보 표시
  const hr = cb.handResult ?? (roll ? previewHand(ctx) : null);
  const handbar = hr ? `<div class="handbar ${cb.handResult ? '' : 'preview'}" data-tip="${esc(HAND_BY_ID[hr.id].name + ' 배율 ×' + hr.mult + ' (피해·방어·골드에 적용)')}">
      ${cb.handResult ? '' : '<span class="muted small">예상</span>'}<span class="hname">${hr.name}</span><span class="hmult">×${hr.mult.toFixed(1)}</span>
      ${cb.jackpotTurn ? '<span class="gold">💰잭팟 턴</span>' : ''}</div>` : '<div class="handbar"></div>';

  const rules = [
    cb.houseRule ? `<span class="tag" style="color:var(--red)">${esc(HOUSE_RULES[cb.houseRule])}</span>` : '',
    cb.queenParity ? `<span class="tag" style="color:var(--gold)">이번 턴 ${cb.queenParity === 'odd' ? '홀수' : '짝수'} 눈 피해만 유효</span>` : '',
  ].join('');

  const free = freeDice(cb);
  const tray = cb.hand.map((h) => {
    const sel = roll ? h.locked : ui.sel.includes(h.key);
    const cls = `${h.used ? 'used' : ''} ${roll && h.locked ? 'locked' : ''} ${!roll && sel ? 'sel' : ''} ${ui.picker?.target === h.key ? 'sel' : ''}`;
    const lock = roll && h.locked ? '<span class="lock">🔒</span>' : '';
    return handDieHtml(h, cls, `data-key="${h.key}" data-act="die" data-arg="${h.key}" data-tip="${esc(dieTip(app, h))}"`).replace(/<\/div>$/, `${lock}</div>`);
  }).join('');

  const selKeys = roll ? cb.hand.filter((h) => h.locked && !h.used).map((h) => h.key) : ui.sel;
  const skills = Array.from({ length: Math.max(run.maxSlots, run.skills.length) }, (_, i) => {
    const s = run.skills[i];
    if (!s) return `<div class="skill empty"><span class="muted small">빈 칸</span></div>`;
    const def = SKILL_BY_ID[s.id];
    const used = cb.usedSlots[i] || !skillUsable(ctx, i);
    const ok = !used && selKeys.length > 0 && canUse(ctx, i, selKeys);
    return `<button class="skill r-${def.rarity} ${used ? 'used' : ''} ${ok ? 'ok' : ''}" data-act="slot" data-arg="${i}" data-tip="${esc(def.name + ' [' + condText(def.cond) + ']: ' + fmt(def.desc, def.v) + (s.up ? ` (강화 +${Math.round(s.up * 100)}%)` : ''))}">
      <span class="sn"><span>${esc(def.name)}${s.up ? ` <span class="green small">+${Math.round(s.up * 100)}%</span>` : ''}</span>${rarityTag(def.rarity)}</span>
      <span class="sc">${esc(condText(def.cond))}</span>
      <span class="sd">${esc(fmt(def.desc, def.v))}</span>
    </button>`;
  }).join('');

  const pv = previewPip(ctx);
  const tools = [
    (cb.turnCounters.setValue ?? 0) > 0 ? `<button class="btn" style="min-height:40px;padding:4px 8px;font-size:13px" data-act="openSet">✋ 눈 정하기 ×${cb.turnCounters.setValue}</button>` : '',
    (cb.turnCounters.nudge ?? 0) > 0 ? `<button class="btn" style="min-height:40px;padding:4px 8px;font-size:13px" data-act="openNudge">👆 ±1</button>` : '',
    pv !== null ? `<span class="preview-chip" data-tip="예지: 다음 턴 첫 주사위">👁 다음 ${pv}</span>` : '',
  ].join('');

  const tut = app.ui.tutorialStep >= 1 && app.ui.tutorialStep <= 3 ? `<div class="tutorial">${TUTORIAL[app.ui.tutorialStep]}</div>` : '';

  return `${topbar(app)}
  <div class="screen noscroll" style="gap:6px">
    <div class="enemies">${enemies}</div>
    ${rules ? `<div class="row center" style="flex-wrap:wrap">${rules}</div>` : ''}
    ${handbar}
    <div class="tray">${tray}</div>
    <div class="row center muted small">🐷 저금통 ${cb.piggy}${roll ? ` · 🎲 리롤 ${cb.rerollsLeft}` : ''} · 남은 주사위 ${free.length}</div>
    ${tut}
    <div class="skills ${run.maxSlots > 4 ? 'many' : ''}">${skills}</div>
    <div class="grow"></div>
    <div class="row">${consumablesRow(app)}<div class="grow"></div>${tools}</div>
    <div class="actions">
      ${roll ? `<button class="btn" data-act="reroll" ${cb.rerollsLeft > 0 ? '' : 'disabled'}>🎲 리롤 ${cb.rerollsLeft}</button>
      <button class="btn" data-act="confirm">✓ 족보 확정</button>` : '<span></span><span></span>'}
      <button class="btn primary" data-act="endTurn">턴 종료 ▶</button>
    </div>
  </div>
  ${pickerModal(app)}`;
}

function pickerModal(app: App): string {
  const p = app.ui.picker;
  const cb = app.run!.combat!;
  if (!p) return '';
  const title = p.mode === 'fate' ? '🔮 운명 조작: 바꿀 주사위와 눈을 고르세요' : p.mode === 'set' ? '✋ 원하는 눈으로 바꿀 주사위' : '👆 ±1 할 주사위';
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
