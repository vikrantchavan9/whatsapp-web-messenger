import { Controller, Get, Post, Body, HttpException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

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

  @Post('/send-media')
async sendMedia(@Body() body) {
  const { to, media, caption } = body;

  if (!to || !media) {
    throw new HttpException('Missing "to" or "media" in request body', 400);
  }

  try {
    const res = await this.wa.sendMedia(to, media, caption);
    return { ok: true, res };
  } catch (error) {
    console.error('❌ Media send error:', error);
    return { ok: false, error: error.message || error };
  }
}
}