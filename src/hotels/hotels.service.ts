import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HotelRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HotelsService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string) {
    return this.prisma.hotel.create({ data: { name } });
  }

  findAll() {
    return this.prisma.hotel.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async addMember(hotelId: string, wixMemberId: string, role: HotelRole = HotelRole.STAFF) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      throw new NotFoundException(`Hotel ${hotelId} not found`);
    }
    try {
      return await this.prisma.hotelMember.create({ data: { hotelId, wixMemberId, role } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This member already belongs to a hotel');
      }
      throw err;
    }
  }

  async me(hotelId: string, memberId: string) {
    const member = await this.prisma.hotelMember.findUnique({
      where: { id: memberId },
      include: { hotel: true },
    });
    if (!member || member.hotelId !== hotelId) {
      throw new NotFoundException('Member not found');
    }
    return { hotel: { id: member.hotel.id, name: member.hotel.name }, role: member.role };
  }
}
