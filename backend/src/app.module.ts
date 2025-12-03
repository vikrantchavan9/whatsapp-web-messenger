import { Module } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappController } from "./whatsapp.controller";
import { PostgresService } from "./postgres.service";

@Module({
  imports: [],
  controllers: [WhatsappController],
  providers: [WhatsappService, PostgresService],
})
export class AppModule {}
