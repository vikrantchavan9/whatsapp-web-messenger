"use client";

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Send, Upload, Wifi, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

// ------------------ TYPES ------------------
interface DbMessage {
  whatsID: string;
  msg_id: string;
  in_out: "I" | "O";
  sender: string;
  receiver: string;
  message: string | null;
  attachment_url?: string | null;
  edate: string; // ISO
}

interface LiveIncoming {
  msg_id?: string;
  in_out?: "I" | "O";
  sender?: string;
  receiver?: string;
  message?: string;
  edate?: string;
}
// -----------------------------------------------------

export default function Home() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [history, setHistory] = useState<DbMessage[]>([]);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // -------- MERGE HELPERS --------

function mergeDbMessage(m: DbMessage) {
  setHistory((prev) => {
    let list = [...prev];

    // 1. Remove any local temp messages for same receiver & message
      list = list.filter((x) =>
        !(
          x.msg_id.startsWith("local-") &&
          x.in_out === "O" &&
          x.message === m.message // same body
        )
      );
    // 2. Replace or insert real message
    const exists = list.findIndex((x) => x.msg_id === m.msg_id);

    if (exists !== -1) {
      list[exists] = m;
    } else {
      list.push(m);
    }

    list.sort((a, b) => new Date(a.edate).getTime() - new Date(b.edate).getTime());
    return list;
  });
}

  async function loadHistory() {
    try {
      const res = await axios.get(`${API_URL}/messages`);
      let rows: DbMessage[] = res.data;

      // ⭐ Remove duplicates by msg_id BEFORE setting state
      rows = rows.filter(
      (msg, index, self) =>
        index === self.findIndex((m) => m.msg_id === msg.msg_id)
    );

      rows.sort((a, b) => new Date(a.edate).getTime() - new Date(b.edate).getTime());
      setHistory(rows);
    } catch (err) {
      console.error("History load error:", err);
    }
  }

  // -------- SOCKET INIT & CLEANUP --------

  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current = socket;

    console.log("🔌 Connecting to socket:", SOCKET_URL);

    socket.on("connect", () => {
      console.log("🟢 Socket connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ connect_error:", err);
    });

    socket.on("error", (err) => {
      console.error("❌ socket error:", err);
    });

    socket.on("reconnect_attempt", (n) => {
      console.log("🔁 reconnect attempt:", n);
    });

    // QR received
    socket.on("qr", (qrData: string) => {
      console.log("📸 QR received");
      setQr(qrData);
    });

    // Ready
    socket.on("ready", () => {
      console.log("✅ WhatsApp ready");
      setReady(true);
      setQr(null);
      loadHistory();
    });

    // Incoming / outgoing real-time message
    socket.on("message", (raw: LiveIncoming) => {
      console.log("📩 Live message event:", raw);

      if (!raw.msg_id) return;

      const entry: DbMessage = {
        whatsID: raw.msg_id,
        msg_id: raw.msg_id,
        in_out: raw.in_out === "O" ? "O" : "I",
        sender: raw.sender || "",
        receiver: raw.receiver || "",
        message: raw.message || "",
        edate: raw.edate || new Date().toISOString(),
      };

      mergeDbMessage(entry);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 socket disconnected:", reason);
      setReady(false);
    });

    // Initial QR check
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/qr`);
        if (res.data.qr) setQr(res.data.qr);
        if (res.data.ready) {
          setReady(true);
          loadHistory();
        }
      } catch (err) {
        console.error("Initial QR fetch error:", err);
      }
    })();

    // Cleanup
    return () => {
      console.log("🧹 Cleaning up socket");

      socket.off("connect");
      socket.off("connect_error");
      socket.off("error");
      socket.off("reconnect_attempt");
      socket.off("qr");
      socket.off("ready");
      socket.off("message");
      socket.off("disconnect");

      try {
        socket.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, []);

  // Auto-scroll bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // ------------ SENDING --------------

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) return alert("Enter phone number!");

    try {
      if (files.length > 0) {
        setUploading(true);
        for (const f of files) {
          const fd = new FormData();
          fd.append("file", f);
          fd.append("to", to);
          fd.append("caption", text || "");

          await axios.post(`${API_URL}/send-media`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          const tempId = `local-${Date.now()}`;
          mergeDbMessage({
            whatsID: tempId,
            msg_id: tempId,
            in_out: "O",
            sender: "me",
            receiver: to,
            message: text || f.name,
            edate: new Date().toISOString(),
          });
        }

        setFiles([]);
        setUploading(false);
        setText("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // Send normal text
      await axios.post(`${API_URL}/send`, { to, message: text });

      setText("");
    } catch (err: any) {
      console.error("Send error:", err);
      alert("Send failed: " + err.message);
    }
  }

  // ------------ UI RENDER ------------

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center p-6">
      <div className="w-full max-w-3xl bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">

        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-850">
          <div className="flex items-center gap-2">
            <Wifi className="text-green-400" />
            <h1 className="text-lg font-semibold">WhatsApp Messenger</h1>
          </div>
          <span className={`text-sm ${ready ? "text-green-400" : "text-yellow-400"}`}>
            {ready ? "Connected" : "Scan QR"}
          </span>
        </div>

        {/* QR */}
        {!ready && qr && (
          <div className="flex flex-col items-center justify-center p-6">
            <p className="text-gray-400 mb-3">Scan QR from WhatsApp → Linked Devices</p>
            <img src={qr} className="w-64 h-64 border border-gray-700 rounded-lg" />
          </div>
        )}

        {/* CHAT */}
        {ready && (
          <div className="flex flex-col h-[600px]">

            {/* HISTORY (newest at bottom) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-950">
              {history.length === 0 && (
                <p className="text-center text-gray-500 text-sm mt-10">No messages yet.</p>
              )}

              {history.map((m) => {
                const isMe = m.in_out === "O";
                const fileUrl = m.attachment_url ? `${API_URL}/${m.attachment_url}` : null;

                const isImage =
                  fileUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);

                return (
                  <div key={m.msg_id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div
                          className={`max-w-xs p-3 rounded-lg text-sm ${
                            isMe
                              ? "bg-green-600 text-white rounded-br-none"
                              : "bg-gray-800 text-gray-100 rounded-bl-none"
                          }`}
                        >

                          {/* IMAGE PREVIEW */}
                          {m.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url) && (
                            <img
                              src={m.attachment_url}
                              className="w-full rounded mb-2 border border-gray-700"
                            />
                          )}

                          {/* FILE DOWNLOAD */}
                          {m.attachment_url && !/\.(jpg|jpeg|png|gif|webp)$/i.test(m.attachment_url) && (
                            <a
                              href={m.attachment_url}
                              download
                              className="mb-2 inline-block bg-black/20 border px-2 py-1 rounded"
                            >
                              ⬇ Download Attachment
                            </a>
                          )}

                          {/* CAPTION OR MESSAGE */}
                          {m.message && <div className="mb-1">{m.message}</div>}

                          {/* Sender */}
                          <div className="text-[10px] opacity-60 mt-1">
                            {isMe ? "You" : m.sender.replace("@c.us", "")}
                          </div>

                          {/* Time */}
                          <div className="text-[10px] opacity-70 mt-1 text-right">
                            {new Date(m.edate).toLocaleTimeString()}
                          </div>
                        </div>

                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* SEND BOX */}
            <form onSubmit={send} className="flex gap-2 p-4 border-t border-gray-800 bg-gray-900">
              <input
                type="text"
                placeholder="Phone number"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40 bg-gray-800 p-3 rounded-lg border border-gray-700"
              />

              <input
                type="text"
                placeholder="Type message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 bg-gray-800 p-3 rounded-lg border border-gray-700"
              />

              <label className="flex items-center bg-gray-800 px-3 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700">
                <Upload size={18} className="mr-1" />
                File
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  hidden
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>

              <button
                type="submit"
                disabled={uploading}
                className={`px-4 rounded-lg flex items-center gap-2 ${
                  uploading ? "bg-gray-600 cursor-not-allowed" : "bg-green-500 hover:bg-green-600"
                }`}
              >
                <Send size={18} />
                {uploading ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}

        {/* FOOTER */}
        <div className="text-gray-500 text-xs text-center p-3 border-t border-gray-800">
          <Smartphone size={14} className="inline-block mr-1" />
          WhatsApp Messenger © 2025
        </div>
      </div>
    </div>
  );
}
