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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ Connect to Socket.IO once
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    console.log("🔌 Connecting to socket:", SOCKET_URL);

    // Listen for QR code
    socket.on("qr", (dataUrl: string) => {
      console.log("📸 QR received");
      setQr(dataUrl);
    });

    // Listen for ready event
    socket.on("ready", () => {
      console.log("✅ WhatsApp client ready");
      setReady(true);
      setQr(null);
    });

    // Listen for messages
    socket.on("message", (m: Message) => {
      console.log("📩 Incoming message:", m);
      setMessages((prev) => [...prev, { ...m, fromMe: false }]);
    });

    socket.on("disconnect", () => console.log("❌ Socket disconnected"));

    // Fetch QR/ready state on load
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/qr`);
        if (res.data.qr) setQr(res.data.qr);
        if (res.data.ready) setReady(true);
      } catch (err) {
        console.error("Error fetching QR:", err);
      }
    })();

    // ✅ Clean up socket connection on unmount
    return () => {
      socket.disconnect();
      console.log("🧹 Socket disconnected");
    };
  }, []);

  // ✅ Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ✅ Convert file to Base64
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
    // ✅ Send text or media
    async function send(e: React.FormEvent) {
      e.preventDefault();
      if (!to) return alert("Enter a recipient number");

      try {
        // --- MULTIPLE FILES CASE ---
        if (files && files.length > 0) {
          setUploading(true);
          for (const f of files) {
            const formData = new FormData();
            formData.append("file", f);
            formData.append("to", to);
            formData.append("caption", text || "");
            await axios.post(`${API_URL}/send-media`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            // Append each file message to UI
            setMessages((prev) => [
              ...prev,
              {
                from: "You",
                body: text || f.name,
                timestamp: Date.now() / 1000,
                fromMe: true,
                mediaUrl: URL.createObjectURL(f),
                caption: text || "",
              },
            ]);
          }
          // Reset UI
          setFiles([]);
          setText("");
          setUploading(false);
          // Clear file input so user can re-select same file(s)
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return; // Stop here (don't send text twice)
        }

        // --- TEXT ONLY CASE ---
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

    // ✅ Time formatter moved OUTSIDE send()
    function formatTime(t: number) {
      return new Date(t * 1000).toLocaleTimeString();
    }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-850">
          <div className="flex items-center gap-2">
            <Wifi className="text-green-400" />
            <h1 className="text-lg font-semibold">WhatsApp Web Control</h1>
          </div>
          {ready ? (
            <span className="text-sm text-green-400 font-medium">Connected</span>
          ) : (
            <span className="text-sm text-yellow-400">Scan QR to connect</span>
          )}
        </div>

        {/* QR Screen */}
        {!ready && qr && (
          <div className="flex flex-col items-center justify-center p-6">
            <p className="text-gray-400 mb-3">
              Scan the QR with your phone (WhatsApp → Linked Devices)
            </p>
            <img
              src={qr}
              alt="QR Code"
              className="w-64 h-64 border-2 border-gray-700 rounded-lg"
            />
          </div>
        )}

        {/* Main Chat Area */}
        {ready && (
          <div className="flex flex-col h-[600px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-950">
              {messages.length === 0 ? (
                <p className="text-center text-gray-500 text-sm mt-10">
                  No messages yet.
                </p>
              ) : (
                messages.map((m, i) => (
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
                      
                    {m.mediaUrl ? (
                        <>
                          {/* 🖼 Image */}
                          {m.mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i) && (
                            <img
                              src={m.mediaUrl}
                              alt="media"
                              className="rounded-lg mb-2 max-h-48"
                            />
                          )}

                          {/* 🎥 Video */}
                          {m.mediaUrl.match(/\.(mp4|mov|webm)$/i) && (
                            <video
                              src={m.mediaUrl}
                              controls
                              className="rounded-lg mb-2 max-h-48"
                            />
                          )}

                          {/* 🎧 Audio */}
                          {m.mediaUrl.match(/\.(mp3|wav|ogg)$/i) && (
                            <audio
                              src={m.mediaUrl}
                              controls
                              className="w-full mb-2"
                            />
                          )}

                          {/* 📄 Document / Other Files */}
                          {!m.mediaUrl.match(
                            /\.(jpg|jpeg|png|gif|mp4|mov|webm|mp3|wav|ogg)$/i
                          ) && (
                            <a
                              href={m.mediaUrl}
                              download={m.body || "file"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-sm bg-gray-700 text-white px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors mb-2"
                            >
                              📄 {m.body || "Download file"}
                            </a>
                          )}
                        </>
                      ) : null}

                      <div>{m.body}</div>
                      <div className="text-xs text-gray-300 mt-1 text-right">
                        {m.fromMe ? "You" : m.from} • {formatTime(m.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Form */}
            <form
              onSubmit={send}
              className="flex gap-2 p-4 border-t border-gray-800 bg-gray-900"
            >
              <input
                type="text"
                placeholder="Phone number (e.g. 919876543210)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
              />
              <input
                type="text"
                placeholder="Type your message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
              />

              <label className="flex items-center justify-center bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 cursor-pointer hover:bg-gray-700 transition-colors">
                <Upload size={18} className="mr-1" />
                <span className="text-sm">File</span>
                <input
                  multiple
                  type="file"
                  ref={fileInputRef}
                  hidden
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>

              
              <button
                type="submit"
                disabled={uploading}
                className={`${
                  uploading
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
                } text-white font-medium flex items-center justify-center gap-2 px-4 rounded-lg transition-colors`}
              >
                <Send size={18} />
                {uploading ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="text-gray-500 text-xs text-center p-3 border-t border-gray-800">
          <Smartphone size={14} className="inline-block mr-1" />
          WhatsApp Web Integration © 2025
        </div>
      </div>
    </div>
  );
}