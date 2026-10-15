import { Injectable } from '@nestjs/common';

function positiveSeconds(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

@Injectable()
export class AuthConfig {
  readonly accessSecret: Uint8Array;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly webOrigin: string;

  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new Error('JWT_ACCESS_SECRET must be at least 32 bytes');
    }
    this.accessSecret = new TextEncoder().encode(secret);
    this.accessTtlSeconds = positiveSeconds(process.env.JWT_ACCESS_TTL_SECONDS, 900, 'JWT_ACCESS_TTL_SECONDS');
    this.refreshTtlSeconds = positiveSeconds(process.env.REFRESH_TOKEN_TTL_SECONDS, 604800, 'REFRESH_TOKEN_TTL_SECONDS');
    this.webOrigin = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173').origin;
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlSeconds * 1000);
  }
}
