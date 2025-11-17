"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

interface Message {
  whatsID: string;
  msg_id: string;
  in_out: string; // "I" or "O"
  sender: string;
  receiver: string;
  message: string;
  edate: string;
}

export default function ChatPage() {
  const { phone } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when messages load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch messages
  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get(`${API_URL}/messages?phone=${phone}`);
        setMessages(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [phone]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-300 text-lg">
        Loading chat...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col p-4">
      <h1 className="text-gray-100 text-xl font-semibold mb-4">
        Chat with {phone}
      </h1>

      <div className="flex-1 overflow-y-auto bg-gray-900 rounded-xl p-4 space-y-3 border border-gray-800">
        {messages.map((msg) => {
          const isMe = msg.in_out === "O"; // Outgoing message

          return (
            <div
              key={msg.whatsID}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                  isMe
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-200"
                }`}
              >
                <div>{msg.message}</div>
                <div className="text-xs mt-1 opacity-70 text-right">
                  {new Date(msg.edate).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
