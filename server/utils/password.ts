import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Same format as ProjeYonetim: scrypt$<saltHex>$<hashHex>.
export function hashSecret(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifySecret(stored: string, plain: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  const actual = scryptSync(plain, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
