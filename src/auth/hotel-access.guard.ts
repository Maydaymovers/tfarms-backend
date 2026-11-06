import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HotelRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HotelContext } from './hotel-context';

export const MEMBER_HEADER = 'x-wix-member-id';
const ROLES_KEY = 'hotel:roles';
const SERVICE_ONLY_KEY = 'hotel:service-only';

/** Member requests must have one of these roles. Service requests are unaffected. */
export const Roles = (...roles: HotelRole[]) => SetMetadata(ROLES_KEY, roles);
/** Route can only be called without a member header (platform administration). */
export const ServiceOnly = () => SetMetadata(SERVICE_ONLY_KEY, true);

/** The caller's hotel, or null for a service (API key only) request. */
export const CurrentHotel = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HotelContext | null =>
    ctx.switchToHttp().getRequest().hotel ?? null,
);

/**
 * Runs after ApiKeyGuard. With an X-Wix-Member-Id header the request becomes a
 * member request: hotel and role come from the database, never from the client.
 * Without it the request is a trusted service request (previous behavior).
 */
@Injectable()
export class HotelAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw = req.headers?.[MEMBER_HEADER];
    const memberId = Array.isArray(raw) ? raw[0] : raw;
    req.hotel = null;

    const targets = [context.getHandler(), context.getClass()];
    if (!memberId || !memberId.trim()) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(SERVICE_ONLY_KEY, targets)) {
      throw new ForbiddenException('This route is not available to hotel members');
    }

    const member = await this.prisma.hotelMember.findUnique({
      where: { wixMemberId: memberId.trim() },
    });
    if (!member) {
      throw new ForbiddenException('Member is not assigned to a hotel');
    }

    const roles = this.reflector.getAllAndOverride<HotelRole[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(member.role)) {
      throw new ForbiddenException('Your role cannot perform this action');
    }

    req.hotel = { hotelId: member.hotelId, role: member.role, memberId: member.id } satisfies HotelContext;
    return true;
  }
}
