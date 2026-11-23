import { Controller, Get, Header } from '@nestjs/common';
import { ADMIN_HTML } from './admin.html';

/**
 * Serves a static page. It contains no data and no secrets: it asks for an API
 * key in the browser and calls the existing guarded endpoints with it.
 */
@Controller('admin')
export class AdminController {
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  @Header('x-frame-options', 'DENY')
  @Header('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'")
  page(): string {
    return ADMIN_HTML;
  }
}
