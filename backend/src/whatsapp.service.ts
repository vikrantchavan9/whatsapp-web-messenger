import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { Server as IOServer } from 'socket.io';
import * as http from 'http';
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { PostgresService } from './postgres.service';

@Injectable()
export class WhatsappService implements OnModuleInit {
  public client: Client;
  private io: IOServer;
  private qrDataUrl: string | null = null;
  private ready = false;

  constructor(private db: PostgresService) {}

  onModuleInit() {
    this.initClient();
  }

  initClient() {
    // SOCKET SERVER
    const httpServer = http.createServer();
    this.io = new IOServer(httpServer, { cors: { origin: '*' } });
    httpServer.listen(5000, () => console.log('Socket.IO server @5000'));

    this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: "docker1", 
        }),
      puppeteer: {
        headless: true,
        executablePath: "/usr/bin/chromium",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-gpu'
        ]
      }
    });

    // QR
    this.client.on('qr', async qr => {
      this.qrDataUrl = await qrcode.toDataURL(qr);
      this.io.emit('qr', this.qrDataUrl);
    });

    // READY
    this.client.on('ready', () => {
      this.ready = true;
      this.io.emit('ready', true);
      console.log('WhatsApp client ready');
    });

    // ===============================
    //  INCOMING MESSAGES
    // ===============================
    this.client.on("message", async (msg) => {
      const ourId = this.client.info?.wid?._serialized;

      const isFromMe = msg.fromMe || msg.from === ourId || msg.author === ourId;
      if (isFromMe) return; // ignore outgoing duplicates

      let msgText = msg.body || "";
      let attachment_name = null;
      let attachment_path = null;
      let attachment_type = null;

      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) {
            const buffer = Buffer.from(media.data, "base64");
            const ext = mime.extension(media.mimetype) || "bin";
            attachment_name = `incoming-${Date.now()}.${ext}`;
            const savePath = path.join("uploads", attachment_name);
            fs.writeFileSync(savePath, buffer);

            attachment_path = savePath;
            attachment_type = media.mimetype;
            msgText = msg.body || "";
          }
        } catch (err) {
          console.error("MEDIA DOWNLOAD ERROR:", err);
        }
      }

      // EMIT TO FRONTEND
      this.io.emit("message", {
        msg_id: msg.id._serialized,
        in_out: "I",
        sender: msg.from,
        receiver: msg.to || ourId,
        message: msg.body || "",
        attachment_url: attachment_path,
        attachment_name,
        attachment_type,
        edate: new Date().toISOString(),
      });

      // SAVE TO DB
      await this.db.query(
        `INSERT INTO user_whatsapp 
          (msg_id, in_out, sender, receiver, message, attachment_name, attachment_path, attachment_type, edate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          msg.id._serialized,
          "I",
          msg.from,
          msg.to || ourId,
          msg.body || "",
          attachment_name,
          attachment_path,
          attachment_type,
          new Date()
        ]
      );

      console.log("Incoming saved:", msg.body);
    });

    // ===============================
    //  OUTGOING MESSAGES
    // ===============================
    this.client.on("message_create", async (msg) => {
      const ourId = this.client.info?.wid?._serialized;
      const isOutgoing = msg.fromMe || msg.from === ourId;
      if (!isOutgoing) return;

      if (msg.hasMedia) return; // media messages handled separately

      // Emit
      this.io.emit("message", {
        msg_id: msg.id._serialized,
        in_out: "O",
        sender: msg.from,
        receiver: msg.to,
        message: msg.body || "",
        attachment_url: null,
        attachment_name: null,
        edate: new Date().toISOString(),
      });

      // Save to DB
      await this.db.query(
        `INSERT INTO user_whatsapp
        (msg_id, in_out, sender, receiver, message, edate)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          msg.id._serialized,
          "O",
          msg.from,
          msg.to,
          msg.body || "",
          new Date()
        ]
      );

      console.log("Outgoing text saved:", msg.body);
    });

    // INIT
    this.client.initialize().catch(err => console.error('Client init error:', err));
  }

  getQr() { return this.qrDataUrl; }
  isReady() { return this.ready; }

  // ========================
  // SEND TEXT MESSAGE
  // ========================
  async sendMessage(to: string, message: string) {
    if (!this.ready) throw new Error('Client not ready');

    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const jid = `${phone}@c.us`;

    const res = await this.client.sendMessage(jid, message);

    return res;
  }

  // ========================
  // GET MESSAGES
  // ========================
  async getMessages(phone?: string, limit: number = 100) {
    let jid = null;

    if (phone) {
      let p = phone.replace(/\D/g, '');
      if (p.length === 10) p = '91' + p;
      jid = `${p}@c.us`;
    }


      const rows = jid
        ? await this.db.query(
            `SELECT * FROM user_whatsapp
            WHERE sender=$1 OR receiver=$1
            ORDER BY edate ASC
            LIMIT $2`,
            [jid, limit]
          )
        : await this.db.query(
            `SELECT * FROM user_whatsapp
            ORDER BY edate ASC
            LIMIT $1`,
            [limit]
          );

      return rows.map(row => ({
        whatsID: row.whatsid?.toString(),
        msg_id: row.msg_id,
        in_out: row.in_out,
        sender: row.sender,
        receiver: row.receiver,
        message: row.message,
        attachment_name: row.attachment_name,
        attachment_url: row.attachment_path,
        edate: row.edate,
      }));
    }

  // ========================
  // SEND MEDIA
  // ========================
  async sendMedia(to: string, filePath: string, caption?: string, fileUrl?: string){
    if (!this.ready) throw new Error("Not ready");

    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const jid = `${phone}@c.us`;

    const absolutePath = path.resolve(filePath);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";
    const fileData = fs.readFileSync(absolutePath, { encoding: "base64" });
    const filename = path.basename(absolutePath);

    const media = new MessageMedia(mimeType, fileData, filename);

    let result;

    // Audio caption fix
    if (mimeType.startsWith("audio/")) {
      result = await this.client.sendMessage(jid, media);
      if (caption) await this.client.sendMessage(jid, caption);
    } else {
      result = await this.client.sendMessage(jid, media, { caption });
    }

    // SAVE OUTGOING MEDIA
    await this.db.query(
      `INSERT INTO user_whatsapp
         (msg_id, in_out, sender, receiver, message, attachment_name, attachment_path, attachment_type, edate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        result.id._serialized,
        "O",
        this.client.info.wid._serialized,
        jid,
        caption || null,
        filename,
        fileUrl || filePath,
        mimeType,
        new Date()
      ]
    );

    return result;
  }
}
