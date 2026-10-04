import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule, getCorsOptions } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors(getCorsOptions());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`tfarms-backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
