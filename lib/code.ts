import { customAlphabet } from 'nanoid';

// No ambiguous chars: no 0/O, 1/I/L
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const generator = customAlphabet(ALPHABET, CODE_LENGTH);

export function generateCode(): string {
  return generator();
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
