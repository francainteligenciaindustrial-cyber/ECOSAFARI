import React, { useEffect, useState } from "react";
import { LoaderCircle, Heart, CalendarDays } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import WishlistItemCard, { WishItem } from "./WishlistItemCard";

// /lista/:token — lista de desejos compartilhada (só leitura).
export default function SharedListPage({ token }: { token: string }) {
  const [data, setData] = useState<{ nome: string; checkIn: string | null; checkOut: string | null; dono: string | null; itens: WishItem[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/listas/compartilhada/${encodeURIComponent(token)}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Lista não encontrada.");
        setData(body);
      })
      .catch(err => setError(err.message));
  }, [token]);

  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <InfoPageLayout kicker="Lista de desejos compartilhada" title={data?.nome || "Lista de desejos"}>
      {error && <p className="max-w-md mx-auto text-center text-sm text-editorial-muted bg-white border border-editorial-border rounded-3xl p-8">{error}</p>}
      {!error && !data && <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 animate-spin text-editorial-primary" /></div>}
      {data && (
        <div className="space-y-6">
          <p className="text-sm text-editorial-muted flex flex-wrap items-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            {data.dono ? `${data.dono} compartilhou esta lista com você.` : "Uma lista compartilhada com você."}
            {data.checkIn && data.checkOut && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {fmt(data.checkIn)} a {fmt(data.checkOut)}</span>}
          </p>
          {data.itens.length === 0 ? (
            <p className="text-sm text-editorial-muted">Esta lista ainda está vazia.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.itens.map(item => <WishlistItemCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      )}
    </InfoPageLayout>
  );
}
