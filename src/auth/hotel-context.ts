import { HotelRole } from '@prisma/client';

/** Set on the request by HotelAccessGuard when a Wix member header is present. */
export interface HotelContext {
  hotelId: string;
  role: HotelRole;
  memberId: string;
}

/** Narrows queries to one hotel. Empty scope (service mode) means no filter. */
export interface HotelScope {
  hotelId?: string;
}

export function scopeOf(ctx: HotelContext | null | undefined): HotelScope {
  return ctx ? { hotelId: ctx.hotelId } : {};
}
