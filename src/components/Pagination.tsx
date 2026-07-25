import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number; // 1-indexed
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, totalItems, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-xs">
      <span className="text-zinc-500 font-medium">
        Página {page} de {totalPages} · {totalItems} {totalItems === 1 ? "registro" : "registros"}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 border border-zinc-200 rounded px-2.5 py-1.5 font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 border border-zinc-200 rounded px-2.5 py-1.5 font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
        >
          Próxima <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
