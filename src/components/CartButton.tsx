import React from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../lib/cart";
import { navigate } from "../lib/router";

// Ícone do carrinho no topo — só aparece quando há algo dentro.
export default function CartButton({ className = "" }: { className?: string }) {
  const items = useCart();
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => navigate("/carrinho")}
      aria-label={`Carrinho: ${items.length} item(ns)`}
      className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full border border-editorial-border bg-white text-editorial-text hover:bg-editorial-secondary transition cursor-pointer ${className}`}
    >
      <ShoppingBag className="h-4 w-4" />
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-editorial-accent text-white text-[10px] font-bold flex items-center justify-center">
        {items.length}
      </span>
    </button>
  );
}
