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

  constructor(private db: PostgresService) { }

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

  private extractCountryCodeAndPhone(fullPhone: string): { countryCode: string; phoneNumber: string } {
    // Remove all non-digit characters
    const digitsOnly = fullPhone.replace(/\D/g, "");

    // Common country codes are 1-4 digits
    // For India (91), US (1), etc.
    // We'll try to extract the country code by checking common patterns
    let countryCode = "";
    let phoneNumber = "";

    // India: 91 + 10 digits
    if (digitsOnly.startsWith("91") && digitsOnly.length === 12) {
      countryCode = "91";
      phoneNumber = digitsOnly.substring(2);
    }
    // US/Canada: 1 + 10 digits
    else if (digitsOnly.startsWith("1") && digitsOnly.length === 11) {
      countryCode = "1";
      phoneNumber = digitsOnly.substring(1);
    }
    // UK: 44 + 10 digits
    else if (digitsOnly.startsWith("44") && digitsOnly.length === 12) {
      countryCode = "44";
      phoneNumber = digitsOnly.substring(2);
    }
    // China: 86 + 11 digits
    else if (digitsOnly.startsWith("86") && digitsOnly.length === 13) {
      countryCode = "86";
      phoneNumber = digitsOnly.substring(2);
    }
    // Default: try to extract first 1-3 digits as country code
    else if (digitsOnly.length > 10) {
      // Assume phone number is 10 digits, rest is country code
      countryCode = digitsOnly.substring(0, digitsOnly.length - 10);
      phoneNumber = digitsOnly.substring(digitsOnly.length - 10);
    }
    else {
      // If less than or equal to 10 digits, assume no country code
      countryCode = "";
      phoneNumber = digitsOnly;
    }

    return { countryCode, phoneNumber };
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
      // USER REGISTRATION (Only when:  Register <name> )
      //---------------------------------------------
      if (!msg.hasMedia && msg.body) {
        const text = msg.body.trim();
        const phone = msg.from.replace(/\D/g, "");

        // If no Register keyword → skip registration but still save message
        const isRegister = text.toLowerCase().startsWith("register ");

        if (isRegister) {
          const name = text.substring(9).trim();

          if (!this.isValidName(name)) {
            console.log("❌ Please use: Register <your full name>");
            // DO NOT return (still save the incoming message)
          } else {
            // Extract country code and phone number
            const { countryCode, phoneNumber } = this.extractCountryCodeAndPhone(phone);

            const rows: any = await this.db.query(
              `SELECT phone FROM users WHERE country_code = $1 AND phone = $2`,
              [countryCode, phoneNumber]
            );

            if (rows.length === 0) {
              const password = this.generatePassword();

              await this.db.query(
                `INSERT INTO users (country_code, phone, name, password_plain, password_expires)
           VALUES ($1,$2,$3,$4,NOW() + INTERVAL '10 minutes')`,
                [countryCode, phoneNumber, name, password]
              );

              await msg.reply(
                `Hello ${name}, your verification password is: *${password}*`
              );

              console.log(`✔ Registered new user +${countryCode} ${phoneNumber}`);
            } else {
              console.log(`⚠ User already registered (+${countryCode} ${phoneNumber})`);
            }
          }
        }
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
