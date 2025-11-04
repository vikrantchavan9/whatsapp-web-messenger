"use client";

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Send, Wifi, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

interface Message {
  from: string;
  body: string;
  timestamp: number;
  fromMe?: boolean;
}

export default function Home() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const socketRef = useRef<Socket | null>(null);

  // Connect socket + listen to QR, ready, and incoming messages
  useEffect(() => {
  const socket = io(SOCKET_URL, { transports: ["websocket"] });

  socket.on("qr", (dataUrl: string) => setQr(dataUrl));
  socket.on("ready", () => {
    setReady(true);
    setQr(null);
  });
  socket.on("message", (m: any) => {
    setMessages(prev => [...prev, { ...m, fromMe: false }]);
  });

  // Fetch QR status once at start
  (async () => {
    try {
      const res = await axios.get(`${API_URL}/qr`);
      if (res.data.qr) setQr(res.data.qr);
      if (res.data.ready) setReady(true);
    } catch (err) {
      console.error(err);
    }
  })();

  // ✅ Return a cleanup function, not the socket itself
  return () => {
    socket.disconnect();
  };
}, []);

  // Send message
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !text) return alert("Enter number and message");

    try {
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
      alert("Send failed: " + (err.response?.data || err.message));
    }
  }

  // Format timestamp helper
  function formatTime(t: number) {
    return new Date(t * 1000).toLocaleTimeString();
  }

  // UI
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
                    className={`flex ${
                      m.fromMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-xs p-3 rounded-lg text-sm ${
                        m.fromMe
                          ? "bg-green-600 text-white"
                          : "bg-gray-800 text-gray-100"
                      }`}
                    >
                      <div>{m.body}</div>
                      <div className="text-xs text-gray-300 mt-1 text-right">
                        {m.fromMe ? "You" : m.from} • {formatTime(m.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message form */}
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
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-white font-medium flex items-center justify-center gap-2 px-4 rounded-lg transition-colors"
              >
                <Send size={18} />
                Send
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
