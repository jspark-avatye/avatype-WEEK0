import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../application/auth.ports';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 32, parameters, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(32);
    const hash = await deriveKey(password, salt);
    return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const fields = encodedHash.split('$');
    if (fields.length !== 6 || fields[0] !== 'scrypt') return false;
    const [, n, r, p, saltText, hashText] = fields;
    if (n !== String(parameters.N) || r !== String(parameters.r) || p !== String(parameters.p)) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length !== 32 || expected.length !== 32) return false;
    const actual = await deriveKey(password, salt);
    return timingSafeEqual(expected, actual);
  }
}
