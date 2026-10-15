import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { SignJWT, jwtVerify } from 'jose';
import { AuthConfig } from './auth-config';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AccessTokenService {
  constructor(private readonly config: AuthConfig) {}

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('root-api')
      .setAudience('root-web')
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.config.accessSecret);
  }

  async verifyAuthorization(authorization: string | undefined): Promise<string> {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: '인증에 실패했습니다.' });
    try {
      const { payload } = await jwtVerify(token, this.config.accessSecret, {
        algorithms: ['HS256'],
        issuer: 'root-api',
        audience: 'root-web',
        requiredClaims: ['sub', 'iat', 'exp'],
      });
      if (typeof payload.sub !== 'string' || !uuidPattern.test(payload.sub)) throw new Error('Invalid subject');
      return payload.sub;
    } catch {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '인증에 실패했습니다.' });
    }
  }
}
