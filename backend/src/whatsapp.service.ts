import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { Server as IOServer } from 'socket.io';
import * as http from 'http';
import puppeteer from 'puppeteer';

@Injectable()
export class WhatsappService implements OnModuleInit {
  public client: Client;
  private io: IOServer;
  private qrDataUrl: string | null = null;
  private ready = false;

  onModuleInit() {
    this.initClient();
  }

  initClient() {
    const httpServer = http.createServer();
    this.io = new IOServer(httpServer, { cors: { origin: '*' } });
    httpServer.listen(3002, () => console.log('Socket.IO server at :3002'));

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
      headless: true,
      executablePath: puppeteer.executablePath(),   // ✅ Puppeteer-managed Chromium
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
      },
    });

    this.client.on('qr', async (qr) => {
      this.qrDataUrl = await qrcode.toDataURL(qr);
      this.io.emit('qr', this.qrDataUrl);
      console.log('QR received');
    });

    this.client.on('ready', () => {
      this.ready = true;
      this.io.emit('ready', true);
      console.log('WhatsApp client ready');
    });

    this.client.on('message', (msg: Message) => {
      this.io.emit('message', {
        from: msg.from,
        body: msg.body,
        timestamp: msg.timestamp,
      });
      console.log(`📩 ${msg.from}: ${msg.body}`);
    });

    this.client.initialize().catch(err => console.error('Client init error', err));
  }

  getQr() { return this.qrDataUrl; }
  isReady() { return this.ready; }

async sendMessage(to: string, message: string) {
  if (!this.ready) throw new Error('Client not ready');

  // Clean and normalize number
  let phone = to.replace(/\D/g, ''); // remove all non-digits

  // If number has only 10 digits (no country code), assume +91 (India)
  if (phone.length === 10) {
    phone = '91' + phone;
  }

  // If number starts with a +, remove it
  if (phone.startsWith('+')) {
    phone = phone.substring(1);
  }

  // Construct JID
  const jid = `${phone}@c.us`;

  console.log(`📨 Sending to ${jid}: ${message}`);

  const res = await this.client.sendMessage(jid, message);
  return res;
}

}
