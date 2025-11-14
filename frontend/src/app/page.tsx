"use client";

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Send, Upload, Wifi, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

interface Message {
  from: string;
  body: string;
  timestamp: number;
  fromMe?: boolean;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
}

export default function Home() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- SOCKET.IO CONNECTION -----
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    console.log("🔌 Connecting to socket:", SOCKET_URL);

    socket.on("qr", (qrData: string) => {
      console.log("📸 QR Received");
      setQr(qrData);
    });

    socket.on("ready", () => {
      console.log("✅ WhatsApp ready");
      setReady(true);
      setQr(null);
    });

    socket.on("message", (msg: Message) => {
      console.log("📩 Incoming:", msg);
      setMessages((prev) => [...prev, { ...msg, fromMe: false }]);
    });

    socket.on("disconnect", () => console.log("❌ Disconnected"));

    // Fetch QR state once on load
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/qr`);
        if (res.data.qr) setQr(res.data.qr);
        if (res.data.ready) setReady(true);
      } catch (err) {
        console.error("QR fetch error:", err);
      }
    })();

    return () => {
      socket.disconnect();
      console.log("🧹 Socket disconnected");
    };
  }, []);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ----- MEDIA CATEGORY (MIME BASED) -----
  function getMediaCategory(type: string | undefined) {
    if (!type) return "other";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "document"; // pdf, docs, zip...
  }

  // ----- SEND -----
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) return alert("Enter receiver number!");

    try {
      // MULTIPLE FILES CASE
      if (files.length > 0) {
        setUploading(true);

        for (const f of files) {
          const formData = new FormData();
          formData.append("file", f);
          formData.append("to", to);
          formData.append("caption", text || "");

          await axios.post(`${API_URL}/send-media`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          // Add to UI
          setMessages((prev) => [
            ...prev,
            {
              from: "You",
              body: text || f.name,
              timestamp: Date.now() / 1000,
              fromMe: true,
              mediaUrl: URL.createObjectURL(f),
              mediaType: f.type,
              caption: text || "",
            },
          ]);
        }

        // Reset
        setFiles([]);
        setText("");
        setUploading(false);

        if (fileInputRef.current) fileInputRef.current.value = "";

        return; // Stop here (don't send text again)
      }

      // TEXT ONLY
      await axios.post(`${API_URL}/send`, { to, message: text });

      setMessages((prev) => [
        ...prev,
        {
          from: "You",
          body: text,
          timestamp: Date.now() / 1000,
          fromMe: true,
        },
      ]);

      setText("");
    } catch (err: any) {
      setUploading(false);
      alert("Send failed: " + (err.response?.data || err.message));
    }
  }

  // ----- TIMESTAMP FORMAT -----
  function formatTime(t: number) {
    return new Date(t * 1000).toLocaleTimeString();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">

        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-850">
          <div className="flex items-center gap-2">
            <Wifi className="text-green-400" />
            <h1 className="text-lg font-semibold">WhatsApp Messenger</h1>
          </div>
          {ready ? (
            <span className="text-sm text-green-400">Connected</span>
          ) : (
            <span className="text-sm text-yellow-400">Scan QR to connect</span>
          )}
        </div>

        {/* QR SCREEN */}
        {!ready && qr && (
          <div className="flex flex-col items-center justify-center p-6">
            <p className="text-gray-400 mb-3">
              Scan the QR using WhatsApp → Linked Devices
            </p>
            <img src={qr} className="w-64 h-64 border border-gray-700 rounded-lg" />
          </div>
        )}

        {/* CHAT AREA */}
        {ready && (
          <div className="flex flex-col h-[600px]">
            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-950">

              {messages.length === 0 && (
                <p className="text-center text-gray-500 text-sm mt-10">
                  No messages yet.
                </p>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-xs p-3 rounded-lg text-sm ${
                      m.fromMe
                        ? "bg-green-600 text-white"
                        : "bg-gray-800 text-gray-100"
                    }`}
                  >
                    {/* MEDIA PREVIEW */}
                    {m.mediaUrl && (
                      <>
                        {getMediaCategory(m.mediaType) === "image" && (
                          <img src={m.mediaUrl} className="max-h-48 rounded mb-2" />
                        )}

                        {getMediaCategory(m.mediaType) === "video" && (
                          <video
                            src={m.mediaUrl}
                            controls
                            className="max-h-48 rounded mb-2"
                          />
                        )}

                        {getMediaCategory(m.mediaType) === "audio" && (
                          <audio
                            src={m.mediaUrl}
                            controls
                            className="w-full mb-2"
                          />
                        )}

                        {getMediaCategory(m.mediaType) === "document" && (
                          <a
                            href={m.mediaUrl}
                            download={m.body}
                            className="block text-xs bg-gray-700 px-3 py-2 rounded-lg mb-2"
                          >
                            📄 {m.body}
                          </a>
                        )}
                      </>
                    )}

                    <div>{m.body}</div>
                    <div className="text-xs text-gray-300 mt-1 text-right">
                      {m.fromMe ? "You" : m.from} • {formatTime(m.timestamp)}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* SELECTED FILE PREVIEW */}
            {files.length > 0 && (
              <div className="p-2 bg-gray-900 border-t border-gray-800">
                <p className="text-gray-300 text-xs">Selected files:</p>
                {files.map((f, i) => (
                  <div key={i} className="text-gray-400 text-xs">
                    📎 {f.name} ({f.type || "unknown"})
                  </div>
                ))}
              </div>
            )}

            {/* INPUT AREA */}
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
                  uploading
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
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
          WhatsApp Web Integration © 2025
        </div>

      </div>
    </div>
  );
}
