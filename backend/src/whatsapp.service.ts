import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { Server as IOServer } from 'socket.io';
import * as http from 'http';
import fs from "fs";
import path from "path";
import axios from "axios";
import mime from "mime-types";

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
    httpServer.listen(5000, () => console.log('Socket.IO server at :5000'));

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
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

  // 🧩 Clean and normalize number
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

/**
 * Send media to a WhatsApp contact.
 * Supports local file path, public URL, or base64 string.
 */
async sendMedia(to: string, mediaInput: string, caption?: string) {
  if (!this.ready) throw new Error("WhatsApp client not ready");

  let phone = to.replace(/\D/g, "");
  if (phone.length === 10) phone = "91" + phone;
  if (phone.startsWith("+")) phone = phone.substring(1);
  const jid = `${phone}@c.us`;

  console.log(`📤 Sending media to ${jid}`);

  let media: MessageMedia;

  // 1️⃣ From file path
  if (fs.existsSync(mediaInput)) {
    const absolutePath = path.resolve(mediaInput);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";
    const fileData = fs.readFileSync(absolutePath, { encoding: "base64" });
    const filename = path.basename(absolutePath);
    media = new MessageMedia(mimeType, fileData, filename);
    console.log(`📁 Loaded local file: ${absolutePath}`);
  }
  // 2️⃣ From URL
  else if (mediaInput.startsWith("http://") || mediaInput.startsWith("https://")) {
    console.log(`🌐 Fetching media from URL: ${mediaInput}`);
    const response = await axios.get(mediaInput, { responseType: "arraybuffer" });
    const mimeType = response.headers["content-type"] || "application/octet-stream";
    const fileData = Buffer.from(response.data).toString("base64");
    const filename = path.basename(new URL(mediaInput).pathname) || "media";
    media = new MessageMedia(mimeType, fileData, filename);
  }
  // 3️⃣ From base64
  else if (mediaInput.startsWith("data:")) {
    console.log(`🧬 Using base64 media input`);
    const matches = mediaInput.match(/^data:(.+);base64,(.*)$/);
    if (!matches) throw new Error("Invalid base64 data URI format");
    const mimeType = matches[1];
    const fileData = matches[2];
    const filename = "file." + (mime.extension(mimeType) || "bin");
    media = new MessageMedia(mimeType, fileData, filename);
  }
  else {
    throw new Error("Invalid media input: must be a file path, URL, or base64 string");
  }

  // ✅ Send the media
  const result = await this.client.sendMessage(jid, media, { caption });
  console.log("✅ Media sent successfully");
  return result;
}


}