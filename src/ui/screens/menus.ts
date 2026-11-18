import type { App } from '../app';
import { CHARACTERS } from '../../data/characters';
import { STAKES } from '../../data/stakes';
import { RELICS } from '../../data/relics';
import { FACES } from '../../data/faces';
import { ENEMIES } from '../../data/enemies';
import { HANDS } from '../../data/hands';
import { META_LOCKED_START } from '../../data/meta';
import { nextUnlockIn, runPoints } from '../../rules/meta';
import { esc, fmt, rarityTag } from '../components/parts';
import { SKILL_BY_ID } from '../../data/skills';
import { RELIC_BY_ID } from '../../data/relics';
import { FACE_BY_ID } from '../../data/faces';

export function titleScreen(app: App): string {
  const has = !!app.run && app.run.screen !== 'gameover' && app.run.screen !== 'victory';
  const m = app.meta;
  return `<div class="screen center" style="justify-content:center;gap:14px">
    <div class="title-dice">🎲🎰🎲</div>
    <div class="title-logo">DICE<br>MARKET</div>
    <div class="muted center">하우스는 항상 이긴다. 정말 그럴까?</div>
    <div class="col" style="width:100%;max-width:300px;margin:0 auto;gap:10px">
      ${has ? `<button class="btn primary big" data-act="continue">▶ 이어하기 <span class="small">(${app.run!.act}막 ${app.run!.floor + 1}층)</span></button>` : ''}
      <button class="btn ${has ? '' : 'primary'} big" data-act="new">${has ? '새 게임 (현재 판 포기)' : '▶ 새 게임'}</button>
      <button class="btn" data-act="codex">📖 도감</button>
      <button class="btn" data-act="settings">⚙️ 설정</button>
    </div>
    <div class="muted small">판 ${m.stats.runs} · 클리어 ${m.stats.wins} · 야찌 ${m.stats.yahtzees} · 메가 잭팟 ${m.stats.megaJackpots}</div>
    <div class="muted small">실제 돈으로 사는 확률형 상품 없음 · 모든 도박 확률 공개</div>
  </div>`;
}

export function charScreen(app: App): string {
  const m = app.meta;
  const cards = CHARACTERS.map((c) => {
    const unlocked = !c.unlock || m.flags[c.unlock];
    return `<button class="item ${app.ui.charSel === c.id ? 'r-legendary' : ''}" style="width:100%;${unlocked ? '' : 'opacity:.45'}" ${unlocked ? `data-act="char" data-arg="${c.id}"` : 'disabled'}>
      <div class="ic" style="font-size:34px">${unlocked ? c.emoji : '🔒'}</div>
      <div class="grow" style="text-align:left"><div class="tt">${c.name} <span class="muted small">❤${c.hp}</span></div>
      <div class="ds">${esc(c.desc)}</div>
      <div class="ds">스킬: ${c.skills.map((s) => SKILL_BY_ID[s].name).join('·')}</div>
      ${unlocked ? '' : `<div class="ds red">해금: ${esc(c.unlockText)}</div>`}</div>
    </button>`;
  }).join('');
  const stakes = Array.from({ length: m.maxStake + 1 }, (_, i) => `<button class="btn ${app.ui.stakeSel === i ? 'primary' : 'ghost'}" style="min-width:44px;padding:4px" data-act="stake" data-arg="${i}">${i}</button>`).join('');
  const sdesc = app.ui.stakeSel ? STAKES.filter((s) => s.level <= app.ui.stakeSel).map((s) => s.desc).join(' · ') : '기본 난이도';
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>캐릭터 선택</h2></div>
    <div class="col">${cards}</div>
    <div class="card"><div class="row" style="flex-wrap:wrap"><b>⚜ 스테이크</b>${stakes}</div><div class="muted small" style="margin-top:4px">${esc(sdesc)}${m.maxStake < 8 ? ' · 클리어하면 다음 스테이크 해금' : ''}</div></div>
    <div class="grow"></div>
    <button class="btn primary big" data-act="start">하우스에 들어간다 ▶</button>
  </div>`;
}

export function settingsScreen(app: App): string {
  const s = app.settings;
  const tg = (k: string, label: string, on: boolean) => `<button class="item" style="width:100%" data-act="set" data-arg="${k}"><div class="grow tt" style="text-align:left">${label}</div><b class="${on ? 'green' : 'red'}">${on ? 'ON' : 'OFF'}</b></button>`;
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>설정</h2></div>
    ${tg('sound', '🔊 효과음', s.sound)}
    ${tg('vibrate', '📳 진동', s.vibrate)}
    ${tg('shake', '💥 화면 흔들림', s.shake)}
    <button class="item" style="width:100%" data-act="speed"><div class="grow tt" style="text-align:left">⏩ 연출 속도</div><b class="gold">×${s.speed}</b></button>
    <div class="muted small">디버그 패널: 주소 뒤에 ?debug=1</div>
  </div>`;
}

export function codexScreen(app: App): string {
  const c = app.meta.codex;
  const tab = app.ui.codexTab;
  const tabs = `<div class="tabs">${[['relic', '유물'], ['face', '면'], ['enemy', '적'], ['hand', '족보']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="codexTab" data-arg="${k}">${l}</button>`).join('')}</div>`;
  let list = '';
  if (tab === 'relic') list = RELICS.map((r) => c.relics.includes(r.id)
    ? `<div class="item r-${r.rarity}"><div class="ic">${r.emoji}</div><div class="grow"><div class="tt">${r.name} ${rarityTag(r.rarity)}</div><div class="ds">${esc(r.desc)}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'face') list = FACES.map((f) => c.faces.includes(f.id)
    ? `<div class="item r-${f.rarity}"><div class="ic">${f.emoji}</div><div class="grow"><div class="tt">${f.name} ${rarityTag(f.rarity)}</div><div class="ds">${esc(fmt(f.desc, f.v))}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'enemy') list = ENEMIES.map((e) => c.enemies.includes(e.id)
    ? `<div class="item"><div class="ic">${e.emoji}</div><div class="grow"><div class="tt">${e.name} <span class="muted small">${e.act}막 ${e.tier === 'boss' ? '보스' : e.tier === 'elite' ? '엘리트' : ''} ❤${e.hp}</span></div><div class="ds">${esc(e.desc)}</div></div></div>`
    : `<div class="item" style="opacity:.4"><div class="ic">❔</div><div class="grow tt">???</div></div>`).join('');
  if (tab === 'hand') list = HANDS.map((h) => `<div class="item" style="${c.hands.includes(h.id) ? '' : 'opacity:.4'}"><div class="grow"><div class="tt">${h.name}</div><div class="ds">배율 ×${h.mult} · 열기 ${h.heat < 0 ? '초기화' : '+' + h.heat}${h.jackpot ? ` · 잭팟 +${h.jackpot}%` : ''}</div></div></div>`).join('');
  const s = app.meta.stats;
  return `<div class="screen">
    <div class="row"><button class="btn ghost" data-act="back">←</button><h2>도감</h2></div>
    <div class="muted small">야찌 ${s.yahtzees}회 · 메가 잭팟 ${s.megaJackpots}회 · 최고 도달 ${s.bestNodes}노드 · 해금 ${app.meta.unlocked.length}/${META_LOCKED_START.length}</div>
    ${tabs}<div class="col">${list}</div>
  </div>`;
}

export function endScreen(app: App): string {
  const run = app.run!;
  const won = run.screen === 'victory';
  const end = app.ui.end;
  const names = (end?.unlocked ?? []).map((u) => {
    const [k, id] = u.split(':');
    return k === 'skill' ? SKILL_BY_ID[id].name : k === 'relic' ? RELIC_BY_ID[id].name : FACE_BY_ID[id].name + ' 면';
  });
  return `<div class="screen center" style="justify-content:center;gap:12px">
    <div style="font-size:64px">${won ? '🏆' : '💀'}</div>
    <h1 class="${won ? 'gold' : 'red'}">${won ? '하우스를 이겼다!' : '게임 오버'}</h1>
    ${won ? '' : `<div class="muted">${esc(run.stats.deathBy ?? '')}에게 쓰러졌다</div>`}
    <div class="card col" style="text-align:left">
      <div>도달: ${run.act}막 ${run.floor + 1}층 (${run.nodesReached}노드) · 보스 ${run.bossesKilled}</div>
      <div>야찌 ${run.stats.yahtzees} · 잭팟 턴 ${run.stats.jackpotTurns} · 도박 ${run.stats.gambles} · 처치 ${run.stats.kills}</div>
      <div class="gold">해금 포인트 +${end?.points ?? runPoints(run)} <span class="muted small">(노드 ${run.nodesReached} + 보스×5)</span></div>
      ${names.length ? `<div class="green">새로 해금: ${names.map(esc).join(', ')}</div>` : ''}
      <div class="muted small">다음 해금까지 ${nextUnlockIn(app.meta)}점</div>
    </div>
    <button class="btn primary big" data-act="again">🔁 즉시 재시작</button>
    <button class="btn" data-act="toTitle">타이틀로</button>
  </div>`;
}
