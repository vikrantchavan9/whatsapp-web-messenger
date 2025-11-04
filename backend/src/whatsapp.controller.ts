import { Controller, Get, Post, Body, HttpException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller()
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  @Get('qr')
  getQr() {
    return { qr: this.wa.getQr(), ready: this.wa.isReady() };
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
}
