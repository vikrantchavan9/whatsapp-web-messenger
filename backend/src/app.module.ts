import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [],
  controllers: [WhatsappController],
  providers: [WhatsappService, PrismaService],
})
export class AppModule { }
