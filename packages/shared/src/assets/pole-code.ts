/**
 * Pole codes are printed on the QR plate of every pole, e.g. `IND-004182-7`:
 *
 *   IND     tenant code (3 letters)
 *   004182  pole serial within the tenant (zero-padded to 6+ digits)
 *   7       Luhn check digit over the serial — catches any single mistyped digit
 *           and most swapped neighbouring digits, so a typo never files a
 *           complaint against the wrong pole.
 */

export const POLE_SERIAL_MIN_DIGITS = 6;

const POLE_CODE_PATTERN = /^([A-Z]{3})-(\d{6,9})-(\d)$/;

/** Luhn (mod 10) check digit for a string of digits. */
export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let index = digits.length - 1; index >= 0; index--) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function formatPoleCode(tenantCode: string, serial: number): string {
  if (!/^[A-Z]{3}$/.test(tenantCode)) {
    throw new Error('Tenant code must be 3 uppercase letters');
  }
  if (!Number.isInteger(serial) || serial < 1) {
    throw new Error('Pole serial must be a positive integer');
  }
  const digits = String(serial).padStart(POLE_SERIAL_MIN_DIGITS, '0');
  return `${tenantCode}-${digits}-${luhnCheckDigit(digits)}`;
}

export interface ParsedPoleCode {
  tenantCode: string;
  serial: number;
  /** Canonical form, e.g. `IND-004182-7`. */
  code: string;
}

/**
 * Parses user input leniently (lower case, spaces, missing dashes are accepted:
 * "ind 004182 7", "IND0041827") and validates the check digit.
 * Returns null when the input is not a valid pole code.
 */
export function parsePoleCode(input: string): ParsedPoleCode | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  const loose = /^([A-Z]{3})(\d{7,10})$/.exec(compact);
  if (!loose) {
    return null;
  }
  const [, tenantCode, numbers] = loose as unknown as [string, string, string];
  const digits = numbers.slice(0, -1);
  const check = numbers.slice(-1);
  const code = `${tenantCode}-${digits}-${check}`;

  if (!POLE_CODE_PATTERN.test(code) || luhnCheckDigit(digits) !== Number(check)) {
    return null;
  }
  return { tenantCode, serial: Number(digits), code };
}
