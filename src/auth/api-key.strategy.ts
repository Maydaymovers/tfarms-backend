import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import HeaderAPIKeyStrategy from 'passport-headerapikey';

export function getValidApiKeys(): string[] {
  return (process.env.API_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
  constructor() {
    super({ header: 'X-API-Key', prefix: '' }, false, (
      apiKey: string,
      done: (error: Error | null, user?: unknown) => void,
    ) => {
      const valid = getValidApiKeys().some((key) => safeEqual(key, apiKey));
      return valid ? done(null, { apiKey: true }) : done(new UnauthorizedException('Invalid API key'));
    });
  }
}
