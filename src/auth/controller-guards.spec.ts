import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { PayoutsController } from '../payouts/payouts.controller';
import { LedgerController } from '../ledger/ledger.controller';
import { getValidApiKeys } from './api-key.strategy';

type Ctor = { prototype: object };

function guardsFor(controller: Ctor, method: string): unknown[] {
  const handler = (controller.prototype as Record<string, unknown>)[method] as object;
  return [
    ...(Reflect.getMetadata('__guards__', controller) ?? []),
    ...(Reflect.getMetadata('__guards__', handler) ?? []),
  ];
}

function routeMethods(controller: Ctor): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor' && Reflect.hasMetadata('path', (controller.prototype as Record<string, object>)[name]),
  );
}

describe.each([
  ['PayoutsController', PayoutsController, 8],
  ['LedgerController', LedgerController, 1],
])('%s', (_name, controller, expected) => {
  it('has the expected number of routes', () => {
    expect(routeMethods(controller)).toHaveLength(expected);
  });

  it('applies ApiKeyGuard to every route', () => {
    for (const method of routeMethods(controller)) {
      expect(guardsFor(controller, method)).toContain(ApiKeyGuard);
    }
  });
});

describe('ApiKeyGuard without a database', () => {
  const ctx = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
      getClass: () => PayoutsController,
      getHandler: () => PayoutsController.prototype.findAll,
    }) as unknown as ExecutionContext;

  beforeAll(() => {
    process.env.API_KEYS = 'good-key';
    // registers the passport 'api-key' strategy
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiKeyStrategy } = require('./api-key.strategy');
    const passport = require('passport');
    passport.use('api-key', new ApiKeyStrategy());
  });

  it('reads API_KEYS', () => {
    expect(getValidApiKeys()).toEqual(['good-key']);
  });

  it('rejects a missing key', async () => {
    await expect(new ApiKeyGuard().canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid key', async () => {
    await expect(new ApiKeyGuard().canActivate(ctx({ 'x-api-key': 'bad' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid key', async () => {
    await expect(new ApiKeyGuard().canActivate(ctx({ 'x-api-key': 'good-key' }))).resolves.toBe(true);
  });
});
