import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { Server as IOServer } from 'socket.io';
import * as http from 'http';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { PostgresService } from './postgres.service';
import puppeteer from 'puppeteer';

@Injectable()
export class WhatsappService implements OnModuleInit {
  public client: Client;
  private io: IOServer;
  private qrDataUrl: string | null = null;
  private ready = false;

  // ONLY PostgresService injected — FIXED!
  constructor(private db: PostgresService) { }

  async onModuleInit() {
    this.clearWindowsProfileLock();
    await this.initClient();
  }

  //--------------------------------------
  // FIX: CLEAR WINDOWS LOCK FILES
  //--------------------------------------
  private clearWindowsProfileLock() {
    try {
      const authDir = path.join(process.cwd(), '.wwebjs_auth');
      const sessionDir = path.join(authDir, 'main-session');

      const lockFile = path.join(sessionDir, 'SingletonLock');
      const socketDir = path.join(sessionDir, 'SingletonSocket');

      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log('✔ Removed SingletonLock');
      }

      if (fs.existsSync(socketDir)) {
        fs.rmSync(socketDir, { recursive: true, force: true });
        console.log('✔ Removed SingletonSocket folder');
      }
    } catch (err) {
      console.log('⚠ Windows lock clear error:', err.message);
    }
  }

  //--------------------------------------
  // INIT CLIENT
  //--------------------------------------
  async initClient() {
    // SOCKET SERVER
    const httpServer = http.createServer();
    this.io = new IOServer(httpServer, {
      cors: { origin: '*' }
    });

    httpServer.listen(5000, '0.0.0.0', () =>
      console.log('✔ Socket.IO listening on 5000')
    );

    // Chromium from Windows cache
    const chromiumPath = puppeteer.executablePath();
    console.log('✔ Using Chromium:', chromiumPath);

    // WhatsApp Client
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'main-session',
      }),
      puppeteer: {
        executablePath: chromiumPath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--no-first-run'
        ]
      }
    });

    //--------------------------------------
    // QR
    //--------------------------------------
    this.client.on('qr', async qr => {
      this.qrDataUrl = await qrcode.toDataURL(qr);
      console.log('✔ QR generated');
      this.io.emit('qr', this.qrDataUrl);   // FIXED
    });

    //--------------------------------------
    // READY
    //--------------------------------------
    this.client.on('ready', () => {
      this.ready = true;
      console.log('✔ WhatsApp Client Ready');
      this.io.emit('ready', true);          // FIXED
    });

    //--------------------------------------
    // INCOMING MESSAGE
    //--------------------------------------
    this.client.on('message', async msg => {
      const ourId = this.client.info?.wid?._serialized;

      if (msg.fromMe || msg.from === ourId || msg.author === ourId) return;

      let attachment_name = null;
      let attachment_path = null;
      let attachment_type = null;

      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          const buffer = Buffer.from(media.data, 'base64');

          const ext = mime.extension(media.mimetype) || 'bin';
          attachment_name = `incoming-${Date.now()}.${ext}`;

          const savePath = path.join('uploads', attachment_name);
          fs.writeFileSync(savePath, buffer);

          attachment_path = savePath;
          attachment_type = media.mimetype;
        } catch (err) {
          console.log('DOWNLOAD ERROR:', err);
        }
      }

      const data = {
        msg_id: msg.id._serialized,
        in_out: 'I',
        sender: msg.from,
        receiver: msg.to || ourId,
        message: msg.body || '',
        attachment_url: attachment_path,
        attachment_name,
        attachment_type,
        edate: new Date().toISOString()
      };

      this.io.emit('message', data);   // FIXED — frontend listens here

      await this.db.query(
        `INSERT INTO user_whatsapp
         (msg_id, in_out, sender, receiver, message, attachment_name, attachment_path, attachment_type, edate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          data.msg_id,
          'I',
          data.sender,
          data.receiver,
          data.message,
          attachment_name,
          attachment_path,
          attachment_type,
          new Date()
        ]
      );

      console.log('✔ Incoming Saved:', msg.body);
    });

    //--------------------------------------
    // OUTGOING TEXT
    //--------------------------------------
    this.client.on('message_create', async msg => {
      const ourId = this.client.info?.wid?._serialized;

      if (!msg.fromMe && msg.from !== ourId) return;
      if (msg.hasMedia) return;

      const data = {
        msg_id: msg.id._serialized,
        in_out: 'O',
        sender: msg.from,
        receiver: msg.to,
        message: msg.body || '',
        attachment_url: null,
        attachment_name: null,
        edate: new Date().toISOString()
      };

      this.io.emit('message', data);  // FIXED

      await this.db.query(
        `INSERT INTO user_whatsapp
         (msg_id, in_out, sender, receiver, message, edate)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          data.msg_id,
          'O',
          data.sender,
          data.receiver,
          data.message,
          new Date()
        ]
      );

      console.log('✔ Outgoing Saved:', msg.body);
    });

    //--------------------------------------
    // START CLIENT
    //--------------------------------------
    this.client.initialize().catch(err =>
      console.error('❌ Client init error:', err)
    );
  }

  getQr() {
    return this.qrDataUrl;
  }

  isReady() {
    return this.ready;
  }

  //--------------------------------------
  // SEND TEXT
  //--------------------------------------
  async sendMessage(to: string, message: string) {
    if (!this.ready) throw new Error('Client not ready');

    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const jid = `${phone}@c.us`;

    return await this.client.sendMessage(jid, message);
  }

  //--------------------------------------
  // GET HISTORY
  //--------------------------------------
  async getMessages(phone?: string, limit: number = 100) {
    if (phone) {
      let p = phone.replace(/\D/g, '');
      if (p.length === 10) p = '91' + p;
      const jid = `${p}@c.us`;

      return await this.db.query(
        `SELECT * FROM user_whatsapp
         WHERE sender=$1 OR receiver=$1
         ORDER BY edate ASC LIMIT $2`,
        [jid, limit]
      );
    }

    return await this.db.query(
      `SELECT * FROM user_whatsapp ORDER BY edate ASC LIMIT $1`,
      [limit]
    );
  }

  //--------------------------------------
  // SEND MEDIA
  //--------------------------------------
  async sendMedia(to: string, filePath: string, caption?: string, fileUrl?: string) {
    if (!this.ready) throw new Error('Client not ready');

    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const jid = `${phone}@c.us`;

    const absolutePath = path.resolve(filePath);
    const mimeType = mime.lookup(absolutePath) || 'application/octet-stream';
    const fileData = fs.readFileSync(absolutePath, { encoding: 'base64' });
    const filename = path.basename(absolutePath);

    const media = new MessageMedia(mimeType, fileData, filename);

    let result;
    if (mimeType.startsWith('audio/')) {
      result = await this.client.sendMessage(jid, media);
      if (caption) await this.client.sendMessage(jid, caption);
    } else {
      result = await this.client.sendMessage(jid, media, { caption });
    }

    await this.db.query(
      `INSERT INTO user_whatsapp
       (msg_id, in_out, sender, receiver, message, attachment_name, attachment_path, attachment_type, edate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        result.id._serialized,
        'O',
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
