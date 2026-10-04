import { Injectable } from '@nestjs/common';
import { LedgerEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerQueryDto } from './ledger-query.dto';

export interface LedgerPage {
  data: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: LedgerQueryDto): Promise<LedgerPage> {
    const where: Prisma.LedgerEntryWhereInput = {};
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.payoutId) where.payoutId = query.payoutId;
    if (query.type) where.type = query.type;
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const [data, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return { data, total, limit, offset };
  }
}
