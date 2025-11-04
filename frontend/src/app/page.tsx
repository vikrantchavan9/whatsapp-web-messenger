"use client";

import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Send, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

export default function Home() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("qr", (dataUrl: string) => setQr(dataUrl));
    socket.on("ready", () => {
      setReady(true);
      setQr(null);
    });
    socket.on("message", (m: any) => setMessages((prev) => [m, ...prev]));
    socket.on("connect", () => console.log("Socket connected"));

    (async () => {
      try {
        const res = await axios.get(`${API_URL}/qr`);
        if (res.data.qr) setQr(res.data.qr);
        if (res.data.ready) setReady(true);
      } catch {}
    })();

    return () => {
      socket.disconnect();
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !text) return alert("Enter number and message");
    try {
      await axios.post(`${API_URL}/send`, { to, message: text });
      setText("");
    } catch (err: any) {
      alert("Send failed: " + (err.response?.data || err.message));
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-gray-900 rounded-2xl shadow-lg overflow-hidden border border-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-850">
          <div className="flex items-center gap-2">

            <h1 className="text-lg font-semibold">WhatsApp Web Dashboard</h1>
          </div>
          {ready ? (
            <span className="text-sm text-green-400 font-medium">Connected</span>
          ) : (
            <span className="text-sm text-yellow-400">Waiting for scan...</span>
          )}
        </div>

        <div className="p-6 flex flex-col items-center gap-6">
          {!ready && qr && (
            <div className="flex flex-col items-center">
              <p className="text-gray-400 mb-2">
                Scan this QR with your phone (WhatsApp → Linked Devices)
              </p>
              <img src={qr} alt="QR Code" className="w-56 h-56 border-2 border-gray-700 rounded-lg" />
            </div>
          )}

          {ready && (
            <form
              onSubmit={send}
              className="w-full flex flex-col gap-4 bg-gray-850 p-4 rounded-xl border border-gray-800"
            >
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Phone number (e.g. 9876543210 or 919876543210)"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="flex-1 bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
                />
              </div>

              <textarea
                placeholder="Type your message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="bg-gray-800 text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-green-500 outline-none h-24 resize-none"
              />

              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-white font-medium flex items-center justify-center gap-2 py-3 rounded-lg transition-colors"
              >
                <Send size={18} />
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
