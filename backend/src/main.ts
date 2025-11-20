import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { json } from 'body-parser';
import * as dotenv from 'dotenv';

async function bootstrap() {
  const expressApp = express();
  expressApp.use(json());
  dotenv.config();
  
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.enableCors({ origin: true });
  await app.listen(3001);
  console.log('✅ Backend listening on http://0.0.0.0:3001');
}
bootstrap();
