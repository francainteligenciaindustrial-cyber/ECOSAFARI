import React from "react";
import { MessageSquare } from "lucide-react";

interface WhatsAppChatbotProps {
  onOpen: () => void;
}

// Persistent floating button. Clicking it takes the visitor to the dedicated
// EcoCinema video-gate screen (its own URL/slug), which hands off to the real
// agency WhatsApp once the clip finishes.
export default function WhatsAppChatbot({ onOpen }: WhatsAppChatbotProps) {
  return (
    <button
      id="whatsapp-trigger-btn"
      onClick={onOpen}
      className="fixed bottom-6 right-6 bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 z-40 group"
    >
      <MessageSquare className="h-6 w-6" />
      <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 font-medium text-sm whitespace-nowrap">
        Fale Conosco
      </span>
    </button>
  );
}
