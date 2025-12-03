import { Injectable, OnModuleInit } from "@nestjs/common";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode";
import { Server as IOServer } from "socket.io";
import * as http from "http";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import puppeteer from "puppeteer";
import { PostgresService } from "./postgres.service";

@Injectable()
export class WhatsappService implements OnModuleInit {
  public client: Client;
  private io: IOServer;
  private qrDataUrl: string | null = null;
  private ready = false;

  /** Instance ID for debugging which service handled a message */
  private readonly instanceId = Math.random().toString(36).substring(7);

  /** Prevent duplicate handling of the same message globally */
  private static processedMsgIds = new Set<string>();

  constructor(private db: PostgresService) {}

  async onModuleInit() {
    this.clearWindowsProfileLock();
    await this.initClient();
  }

  async onModuleDestroy() {
    if (this.client) {
      console.log("⚠ Destroying WhatsApp Client...");
      await this.client.destroy();
    }
  }

  //---------------------------------------------
  // HELPERS
  //---------------------------------------------
  private generatePassword(length: number = 4): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private isValidName(text: string): boolean {
    const nameRegex = /^[a-zA-Z\s]+$/;
    return nameRegex.test(text) && text.trim().length >= 2;
  }

  private clearWindowsProfileLock() {
    try {
      const authDir = path.join(process.cwd(), ".wwebjs_auth");
      const sessionDir = path.join(authDir, "main-session");

      const lockFile = path.join(sessionDir, "SingletonLock");
      const socketDir = path.join(sessionDir, "SingletonSocket");

      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log("✔ Removed SingletonLock");
      }

      if (fs.existsSync(socketDir)) {
        fs.rmSync(socketDir, { recursive: true, force: true });
        console.log("✔ Removed SingletonSocket folder");
      }
    } catch (err) {
      console.log("⚠ Windows lock clear error:", err.message);
    }
  }

  //---------------------------------------------
  // INITIALIZE WHATSAPP CLIENT + SOCKET.IO
  //---------------------------------------------
  async initClient() {
    /** Prevent reinitialization */
    if (this.client) {
      console.log("⚠ Destroying existing client before restart...");
      await this.client.destroy();
    }

    /** SOCKET.IO SETUP — only initialize once */
    const httpServer = http.createServer();
    if (!this.io) {
      this.io = new IOServer(httpServer, { cors: { origin: "*" } });
      httpServer.listen(5000, "0.0.0.0", () =>
        console.log("✔ Socket.IO listening on 5000")
      );
    }

    /** Puppeteer executable path */
    const chromiumPath = puppeteer.executablePath();
    console.log("✔ Using Chromium:", chromiumPath);

    /** WhatsApp client */
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "main-session",
      }),
      puppeteer: {
        executablePath: chromiumPath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--no-first-run",
        ],
      },
    });

    //---------------------------------------------
    // QR CODE EVENT
    //---------------------------------------------
    this.client.on("qr", async (qr) => {
      this.qrDataUrl = await qrcode.toDataURL(qr);
      console.log("✔ QR generated");
      this.io.emit("qr", this.qrDataUrl);
    });

    //---------------------------------------------
    // READY EVENT
    //---------------------------------------------
    this.client.on("ready", () => {
      this.ready = true;
      console.log("✔ WhatsApp Client Ready");
      this.io.emit("ready", true);
    });

    //---------------------------------------------
    // INCOMING MESSAGES (All logic inside here)
    //---------------------------------------------
    this.client.on("message", async (msg) => {
      const ourId = this.client.info?.wid?._serialized;

      /** Ignore messages sent by us */
      if (msg.fromMe || msg.from === ourId || msg.author === ourId) return;

      /** Prevent duplicate message processing */
      if (WhatsappService.processedMsgIds.has(msg.id._serialized)) {
        console.log(`⛔ Duplicate ignored by Instance [${this.instanceId}]`);
        return;
      }
      WhatsappService.processedMsgIds.add(msg.id._serialized);

      if (WhatsappService.processedMsgIds.size > 2000)
        WhatsappService.processedMsgIds.clear();

      const phone = msg.from.replace(/\D/g, "");
      let attachment_name = null;
      let attachment_path = null;
      let attachment_type = null;

      //---------------------------------------------
      // HANDLE MEDIA
      //---------------------------------------------
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          const buffer = Buffer.from(media.data, "base64");

          const ext = mime.extension(media.mimetype) || "bin";
          attachment_name = `incoming-${Date.now()}.${ext}`;
          const savePath = path.join("uploads", attachment_name);

          fs.writeFileSync(savePath, buffer);

          attachment_path = savePath;
          attachment_type = media.mimetype;
        } catch (err) {
          console.log("DOWNLOAD ERROR:", err);
        }
      }

      //---------------------------------------------
      // USER REGISTRATION / LOGIN LOGIC
      //---------------------------------------------
      if (!msg.hasMedia && msg.body) {
        const body = msg.body.trim();

        // Check if user already exists
        const rows: any = await this.db.query(
          `SELECT password_plain, name FROM users WHERE phone = $1`,
          [phone]
        );

        // 🔥 If user exists → DO NOTHING
        if (rows.length > 0) {
          console.log(`⚠ User ${phone} already registered — ignoring message.`);
          return;
        }

        // If user doesn't exist, validate name
        if (!this.isValidName(body)) return;

        // Create new user + send password only once
        const password = this.generatePassword();

        await this.db.query(
          `INSERT INTO users (phone, name, password_plain, password_expires)
    VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
          [phone, body, password]
        );

        await msg.reply(
          `Hello ${body}, your verification password is: *${password}*`
        );

        console.log(`✔ New User Created: ${body} -> ${password}`);
      }

      //---------------------------------------------
      // SAVE INCOMING MESSAGE TO DATABASE
      //---------------------------------------------
      const data = {
        msg_id: msg.id._serialized,
        in_out: "I",
        sender: msg.from,
        receiver: msg.to || ourId,
        message: msg.body || "",
        attachment_url: attachment_path,
        attachment_name,
        attachment_type,
        edate: new Date().toISOString(),
      };

      this.io.emit("message", data);

      await this.db.query(
        `INSERT INTO user_whatsapp
         (msg_id, in_out, sender, receiver, message, attachment_name, attachment_path, attachment_type, edate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          data.msg_id,
          "I",
          data.sender,
          data.receiver,
          data.message,
          attachment_name,
          attachment_path,
          attachment_type,
          new Date(),
        ]
      );

      console.log("✔ Incoming Saved:", msg.body);
    });

    //---------------------------------------------
    // OUTGOING MESSAGES
    //---------------------------------------------
    this.client.on("message_create", async (msg) => {
      const ourId = this.client.info?.wid?._serialized;

      if (!msg.fromMe && msg.from !== ourId) return;
      if (msg.hasMedia) return;

      const data = {
        msg_id: msg.id._serialized,
        in_out: "O",
        sender: msg.from,
        receiver: msg.to,
        message: msg.body || "",
        attachment_url: null,
        attachment_name: null,
        edate: new Date().toISOString(),
      };

      this.io.emit("message", data);

      await this.db.query(
        `INSERT INTO user_whatsapp
         (msg_id, in_out, sender, receiver, message, edate)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [data.msg_id, "O", data.sender, data.receiver, data.message, new Date()]
      );

      console.log("✔ Outgoing Saved:", msg.body);
    });

    //---------------------------------------------
    // START WHATSAPP CLIENT
    //---------------------------------------------
    this.client
      .initialize()
      .catch((err) => console.error("❌ Client init error:", err));
  }

  //---------------------------------------------
  // PUBLIC METHODS
  //---------------------------------------------
  getQr() {
    return this.qrDataUrl;
  }

  isReady() {
    return this.ready;
  }

  async sendMessage(to: string, message: string) {
    if (!this.ready) throw new Error("Client not ready");

    let phone = to.replace(/\D/g, "");
    if (phone.length === 10) phone = "91" + phone;
    const jid = `${phone}@c.us`;

    return await this.client.sendMessage(jid, message);
  }

  async getMessages(phone?: string, limit: number = 500) {
    if (phone) {
      let p = phone.replace(/\D/g, "");
      if (p.length === 10) p = "91" + p;
      const jid = `${p}@c.us`;

      const rows = await this.db.query(
        `SELECT * FROM user_whatsapp
       WHERE sender=$1 OR receiver=$1
       ORDER BY edate DESC
       LIMIT $2`,
        [jid, limit]
      );

      return rows.reverse();
    }

    // ALL MESSAGES (latest first)
    const rows = await this.db.query(
      `SELECT * FROM user_whatsapp
     ORDER BY edate DESC
     LIMIT $1`,
      [limit]
    );

    return rows.reverse();
  }

  async sendMedia(
    to: string,
    filePath: string,
    caption?: string,
    fileUrl?: string
  ) {
    if (!this.ready) throw new Error("Client not ready");

    let phone = to.replace(/\D/g, "");
    if (phone.length === 10) phone = "91" + phone;
    const jid = `${phone}@c.us`;

    const absolutePath = path.resolve(filePath);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";
    const fileData = fs.readFileSync(absolutePath, { encoding: "base64" });
    const filename = path.basename(absolutePath);

    const media = new MessageMedia(mimeType, fileData, filename);

    let result;
    if (mimeType.startsWith("audio/")) {
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
        "O",
        this.client.info.wid._serialized,
        jid,
        caption || null,
        filename,
        fileUrl || filePath,
        mimeType,
        new Date(),
      ]
    );

    return result;
  }
}
