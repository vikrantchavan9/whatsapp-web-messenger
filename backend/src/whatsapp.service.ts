import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { Server as IOServer } from 'socket.io';
import * as http from 'http';
import fs from "fs";
import path from "path";
import axios from "axios";
import mime from "mime-types";
import { PrismaService } from '../src/prisma.service';

@Injectable()
export class WhatsappService implements OnModuleInit {
  public client: Client;
  private io: IOServer;
  private qrDataUrl: string | null = null;
  private ready = false;

  constructor(private prisma: PrismaService) { }

  onModuleInit() {
    this.initClient();
  }

  initClient() {

    // Initialize Socket.IO server
    const httpServer = http.createServer();
    this.io = new IOServer(httpServer, { cors: { origin: '*' } });
    httpServer.listen(5000, () => console.log('Socket.IO server at :5000'));

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',  // 👈 Arch Linux Chromium
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',

          '--disable-dev-shm-usage',
          '--no-zygote',
          '--no-first-run',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-webgl',
          '--disable-features=VizDisplayCompositor',

          '--renderer-process-limit=1',
          '--no-default-browser-check',
          '--disable-breakpad',
        ],
      },
    });

    // qr code generation
    this.client.on('qr', async (qr) => {
      this.qrDataUrl = await qrcode.toDataURL(qr);
      this.io.emit('qr', this.qrDataUrl);
      console.log('QR received');
    });

    // client is ready
    this.client.on('ready', () => {
      this.ready = true;
      this.io.emit('ready', true);
      console.log('WhatsApp client ready');
    });
    
// ========= INCOMING MESSAGES ONLY ==========
this.client.on("message", async (msg) => {
  const ourId = this.client.info?.wid?._serialized;

  // True outgoing conditions
  const isFromMe =
    msg.fromMe ||
    msg.from === ourId ||
    msg.author === ourId;

    console.log(isFromMe,"const isFromMe initiated // incoming only");

  if (isFromMe) return;  // ⬅️ STOP all outgoing duplication

  const direction = "I";

  this.io.emit("message", {
    msg_id: msg.id._serialized,
    in_out: "I",
    sender: msg.from,
    receiver: msg.to || ourId,
    message: msg.body || "",
    edate: new Date().toISOString(),
  });

  console.log(`message emitted from message client ${msg.body} // incoming only`)

  await this.prisma.user_whatsapp.create({
    data: {
      msg_id: msg.id._serialized,
      in_out: "I",
      sender: msg.from,
      receiver: msg.to || ourId,
      message: msg.body || "",
      edate: new Date(),
    },
  });
  console.log(`message saved to db via message client: ${msg.body} // incoming only`);
});

// ========= OUTGOING MESSAGES ONLY ==========
this.client.on("message_create", async (msg) => {
  const ourId = this.client.info?.wid?._serialized;

  const isOutgoing = msg.fromMe || msg.from === ourId;
  // console.log(isOutgoing,"const isOutgoing initiated // outgoing only");

  if (!isOutgoing) return; 
  
    // Skip media, because sendMedia() already saved it
  if (msg.hasMedia) {
    console.log("⏩ Skipping DB save from message_create for media");
    return;
  }// ⬅️ FIX: prevents duplicate incoming

  // outgoing only
  this.io.emit("message", {
    msg_id: msg.id._serialized,
    in_out: "O",
    sender: msg.from,
    receiver: msg.to,
    message: msg.body || "",
    edate: new Date().toISOString(),
  });

  console.log(`message_create client // message emitted: ${msg.body} // outgoing only`)

  await this.prisma.user_whatsapp.create({
    data: {
      msg_id: msg.id._serialized,
      in_out: "O",
      sender: msg.from,
      receiver: msg.to,
      message: msg.body || "",
      edate: new Date(),
    },
  });
    console.log(`message_create client // message saved to db: ${msg.body} // outgoing only`);
});


    this.client
      .initialize()
      .catch((err) => console.error('Client init error', err));
  }

  // Getters for QR code and readiness
  getQr() { return this.qrDataUrl; }
  isReady() { return this.ready; }

  // Send a text message to a WhatsApp contact
  async sendMessage(to: string, message: string) {
    if (!this.ready) throw new Error('Client not ready');

    let phone = to.replace(/\D/g, ''); // remove all non-digits
    if (phone.length === 10) phone = '91' + phone; // If number has only 10 digits (no country code), assume +91 (India)
    if (phone.startsWith('+')) phone = phone.substring(1); // If number starts with a +, remove it

    // Construct JID
    const jid = `${phone}@c.us`;
    console.log(`async sendMessage // 📨 Sending to ${jid}: ${message}`);
    const res = await this.client.sendMessage(jid, message);

    return res;
  }

  // Get messages from a specific phone number

async getMessages(phone?: string, limit: number = 100) {
  let phoneSearch = undefined;

  if (phone) {
    let p = phone.replace(/\D/g, '');
    if (p.length === 10) p = '91' + p;
    phoneSearch = `${p}@c.us`;
  }

  const rows = await this.prisma.user_whatsapp.findMany({
    where: phoneSearch
      ? {
          OR: [{ sender: phoneSearch }, { receiver: phoneSearch }]
        }
      : undefined,
    orderBy: { edate: 'asc' },
    take: limit,
  });

  // ⭐ Convert BigInt → string here
  return rows.map(row => ({
    ...row,
    whatsID: row.whatsID.toString(),
  }));
}

    // 📤 Send Media (file path, URL, base64)
    async sendMedia(
      to: string,
      filePath: string,
      caption?: string,
      fileUrl?: string
    ){
      if (!this.ready) throw new Error("WhatsApp client not ready");

      let phone = to.replace(/\D/g, "");
      if (phone.length === 10) phone = "91" + phone;
      if (phone.startsWith("+")) phone = phone.substring(1);

      const jid = `${phone}@c.us`;
      console.log(`📤 Sending media to ${jid}`);

      // Load file as MessageMedia
    const absolutePath = path.resolve(filePath);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";
    const fileData = fs.readFileSync(absolutePath, { encoding: "base64" });
    const filename = path.basename(absolutePath);

    const media = new MessageMedia(mimeType, fileData, filename);

    // Send via WhatsApp
    const result = await this.client.sendMessage(jid, media, { caption });

    console.log("📨 WA Media sent successfully");

      // Save OUTGOING media message to DB
        try {
          await this.prisma.user_whatsapp.create({
            data: {
              msg_id: result.id._serialized,
              in_out: "O",
              sender: this.client.info.wid._serialized,
              receiver: jid,   
              message: caption || null, // Caption text (optional) 
              attachment_path: fileUrl || null, // File URL (public)  
              attachment_type: mimeType, // Mime type (image/png, audio/mpeg, application/pdf, etc)
              edate: new Date(),
            },
          });

          console.log(`💾 Media saved to DB: ${fileUrl || filename}`);
        } catch (err) {
          console.error("❌ DB Save Error (media):", err);
        }

  return result;
  
    }
  }