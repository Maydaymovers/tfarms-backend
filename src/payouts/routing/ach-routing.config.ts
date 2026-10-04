import { Prisma } from '@prisma/client';

export interface AchRoute {
  id: string;
  provider: string;
  enabled: boolean;
  minAmount: Prisma.Decimal;
  maxAmount: Prisma.Decimal;
  priority: number;
}

export interface AchRoutingConfig {
  routes: AchRoute[];
  fallbackRail: 'MANUAL' | 'OTHER';
}

export const DEFAULT_ACH_ROUTING_CONFIG: AchRoutingConfig = {
  routes: [
    {
      id: 'ach-primary',
      provider: 'primary',
      enabled: true,
      minAmount: new Prisma.Decimal('0.01'),
      maxAmount: new Prisma.Decimal('25000.00'),
      priority: 1,
    },
    {
      id: 'ach-secondary',
      provider: 'secondary',
      enabled: true,
      minAmount: new Prisma.Decimal('0.01'),
      maxAmount: new Prisma.Decimal('100000.00'),
      priority: 2,
    },
  ],
  fallbackRail: 'MANUAL',
};
