import { Controller, Get, Post, Body,Query, HttpException, UseInterceptors, UploadedFile} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from "express";
import * as path from 'path';
import { diskStorage } from "multer";

@Controller()
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  @Get()
  healthCheck() {
    return { status: 'ok', service: 'whatsapp-backend', connected: true };
  }

  @Get('/status')
  getStatus() {
  const client = this.wa.client;
  if (!client) return { status: 'not_initialized' };
  return {
    ready: this.wa.isReady(),
    info: client.info || null,
    authenticated: !!client.info?.wid,
  };

  }
  @Get('qr')
  getQr() {
    return { qr: this.wa.getQr(), ready: this.wa.isReady() };
  }

  @Get('/messages')
  async getMessages(
    @Query('phone') phone?: string,
    @Query('limit') limit: number = 100
  ) {
    return this.wa.getMessages(phone, limit);
  }

  @Post('send')
  async send(@Body() body: { to: string; message: string }) {
    const { to, message } = body;
    if (!to || !message) throw new HttpException('Invalid payload', 400);
    try {
      const res = await this.wa.sendMessage(to, message);
      return { ok: true, res };
    } catch (err) {
      throw new HttpException(String(err), 500);
    }
  }

  @Post("/send-media")
  @UseInterceptors(
  FileInterceptor("file", {
    storage: diskStorage({
      destination: "./uploads",
      filename: (req, file, callback) =>
        callback(null, `${Date.now()}-${file.originalname}`),
    }),
  })
)
  async sendMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body
  ) {
    console.log("Uploaded file received:", file); // DEBUG

    if (!file) {
      throw new HttpException("No file uploaded", 400);
    }

    const { to, caption } = body;
    if (!to) throw new HttpException("Missing recipient number", 400);

    const filePath = path.resolve(file.path);
    console.log("Resolved file path:", filePath);

    try {
      const res = await this.wa.sendMedia(to, filePath, caption);
      return { ok: true, res };
    } catch (err) {
      console.error("❌ Media send error:", err);
      throw new HttpException(err.message || err, 500);
    }
  }
}