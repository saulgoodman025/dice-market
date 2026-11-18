import { describe, expect, it } from 'vitest';
import { evaluateHand, evalFixed } from '../src/rules/hands';

const h = (s: string) => evalFixed(s.split('-').map(Number));

describe('족보 10종 판정', () => {
  it('노 핸드', () => {
    expect(h('1-2-4-5-6')).toBe('none');
    expect(h('2-3-5-6-1')).toBe('none');
  });
  it('원 페어', () => expect(h('1-1-3-5-6')).toBe('pair'));
  it('투 페어', () => expect(h('1-1-3-3-6')).toBe('twopair'));
  it('플러시: 전부 홀수 / 전부 짝수', () => {
    expect(h('1-3-5-5-1')).toBe('flush');
    expect(h('2-4-6-2-6')).toBe('flush'); // 투 페어보다 플러시가 높다
    expect(h('1-3-5-1-3')).toBe('flush');
  });
  it('트리플 > 플러시', () => {
    expect(h('2-2-2-4-6')).toBe('triple');
    expect(h('3-3-3-1-6')).toBe('triple');
  });
  it('스몰 스트레이트: 1-2-3-4-6', () => expect(h('1-2-3-4-6')).toBe('small'));
  it('스몰 스트레이트: 중복 포함 3-4-5-6-6', () => expect(h('3-4-5-6-6')).toBe('small'));
  it('풀하우스: 2-2-3-3-3', () => expect(h('2-2-3-3-3')).toBe('full'));
  it('라지 스트레이트', () => {
    expect(h('2-3-4-5-6')).toBe('large');
    expect(h('5-4-3-2-1')).toBe('large');
  });
  it('포카드', () => expect(h('4-4-4-4-1')).toBe('four'));
  it('야찌', () => expect(h('6-6-6-6-6')).toBe('yahtzee'));
  it('세븐 면은 스트레이트 불가', () => expect(h('3-4-5-6-7')).toBe('small'));
  it('제로 면은 짝수', () => expect(h('0-2-4-6-2')).toBe('flush'));
  it('와일드는 가장 유리한 눈', () => {
    expect(evaluateHand([{ pip: 6 }, { pip: 6 }, { pip: 6 }, { pip: 6 }, { pip: 6, wild: true }])).toBe('yahtzee');
    expect(evaluateHand([{ pip: 1 }, { pip: 2 }, { pip: 3 }, { pip: 4 }, { pip: 1, wild: true }])).toBe('large');
  });
  it('자석은 다른 주사위 눈으로 취급', () => {
    expect(evaluateHand([{ pip: 3 }, { pip: 3 }, { pip: 3 }, { pip: 5 }, { pip: 1, magnet: true }])).toBe('four');
  });
  it('작은 사다리: 연속 3개 = 스몰', () => {
    expect(evalFixed([1, 2, 3, 5, 5], { smallLadder: true })).toBe('small');
    expect(evalFixed([1, 2, 3, 5, 5])).toBe('pair');
  });
  it('6개 주사위', () => expect(evalFixed([1, 1, 1, 1, 1, 2])).toBe('yahtzee'));
});
