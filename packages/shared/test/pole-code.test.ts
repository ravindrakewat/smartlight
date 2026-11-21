import { describe, expect, it } from 'vitest';
import { formatPoleCode, luhnCheckDigit, parsePoleCode } from '../src';

describe('pole codes', () => {
  it('computes the Luhn check digit', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
  });

  it('formats and parses a round trip', () => {
    const code = formatPoleCode('IND', 4182);
    expect(code).toMatch(/^IND-004182-\d$/);
    expect(parsePoleCode(code)).toEqual({ tenantCode: 'IND', serial: 4182, code });
  });

  it('accepts lenient citizen input', () => {
    const code = formatPoleCode('DEL', 12);
    const compact = code.replace(/-/g, '').toLowerCase();
    expect(parsePoleCode(compact)?.code).toBe(code);
    expect(parsePoleCode(code.replace(/-/g, ' '))?.code).toBe(code);
  });

  it('rejects a mistyped digit', () => {
    const code = formatPoleCode('IND', 4182);
    const typo = code.replace('4182', '4183');
    expect(parsePoleCode(typo)).toBeNull();
  });

  it('rejects swapped neighbouring digits', () => {
    const code = formatPoleCode('IND', 4182);
    const swapped = code.replace('4182', '4812');
    expect(parsePoleCode(swapped)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parsePoleCode('hello')).toBeNull();
    expect(parsePoleCode('IN-004182-7')).toBeNull();
    expect(() => formatPoleCode('in', 1)).toThrow();
    expect(() => formatPoleCode('IND', 0)).toThrow();
  });
});
