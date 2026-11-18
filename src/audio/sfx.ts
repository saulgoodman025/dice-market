// Web Audio 합성 효과음. 에셋 파일 없음.
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let tempo = 1;

export function setSound(on: boolean) { enabled = on; }
export function setTempo(t: number) { tempo = t; }

function ctx(): AudioContext | null {
  if (!enabled) return null;
  if (!ac) {
    const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ac = new C();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slideTo?: number) {
  const a = ctx();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, delay = 0, hp = 1200) {
  const a = ctx();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = ((s / 0x7fffffff) * 2 - 1) * (1 - i / len);
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0.05, 'square', 0.15),
  roll: () => { for (let i = 0; i < 6; i++) noise(0.04, 0.25, (i * 0.07) / tempo, 1800 + i * 200); },
  lock: () => tone(880, 0.06, 'triangle', 0.25),
  hit: (big = false) => { tone(big ? 220 : 330, 0.18, 'square', 0.35, 0, big ? 60 : 110); noise(0.08, 0.3, 0, 600); },
  crit: () => { tone(880, 0.1, 'square', 0.3); tone(440, 0.25, 'sawtooth', 0.3, 0.05, 110); noise(0.15, 0.4, 0, 400); },
  hurt: () => { tone(160, 0.25, 'sawtooth', 0.35, 0, 70); },
  block: () => { tone(520, 0.08, 'triangle', 0.3); tone(780, 0.1, 'triangle', 0.2, 0.04); },
  heal: () => { tone(523, 0.12, 'sine', 0.3); tone(784, 0.18, 'sine', 0.3, 0.08); },
  coin: () => { tone(1568, 0.06, 'sine', 0.3); tone(2093, 0.12, 'sine', 0.3, 0.06); },
  chip: () => { tone(1200, 0.04, 'square', 0.15); tone(900, 0.05, 'square', 0.12, 0.04); },
  hand: (rank: number) => {
    const base = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659];
    const n = Math.min(4, 1 + Math.floor(rank / 2));
    for (let i = 0; i <= n; i++) tone(base[Math.min(9, rank + i)] * (1 + i * 0.25), 0.16, 'triangle', 0.3, (i * 0.07) / tempo);
  },
  jackpot: () => {
    for (let i = 0; i < 6; i++) tone(i % 2 ? 880 : 660, 0.14, 'square', 0.2, i * 0.14);
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, 'triangle', 0.25, 0.9 + i * 0.02));
  },
  yahtzee: () => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.3, i * 0.08));
    [523, 659, 784].forEach((f) => tone(f, 1.2, 'sine', 0.25, 0.6));
  },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.3, i * 0.22)); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.3, i * 0.12)); },
  tick: () => tone(1400, 0.02, 'square', 0.12),
  reelStop: () => { tone(300, 0.08, 'square', 0.25); noise(0.04, 0.2, 0, 2000); },
  /** 방패로 막는 금속음 */
  clang: () => {
    tone(1320, 0.12, 'triangle', 0.35, 0, 1180);
    tone(2640, 0.08, 'sine', 0.2, 0.005);
    tone(880, 0.25, 'square', 0.12, 0.01, 820);
    noise(0.05, 0.35, 0, 3500);
  },
  /** 방패가 뚫림 */
  shieldBreak: () => {
    tone(1100, 0.08, 'triangle', 0.3, 0, 900);
    noise(0.22, 0.45, 0.03, 1500);
    tone(300, 0.25, 'sawtooth', 0.2, 0.05, 120);
  },
  bad: () => tone(200, 0.25, 'sawtooth', 0.3, 0, 100),
};
