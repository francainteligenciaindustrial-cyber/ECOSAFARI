import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Mini-mapa da seção "Localização e como chegar" — OpenStreetMap, sem
// cookies. Carregado sob demanda (lazy) para não pesar a página.
export default function LocationMiniMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([lat, lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--color-editorial-primary,#101B4C);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    L.marker([lat, lng], { icon, title: label, keyboard: false }).addTo(map);
    return () => { map.remove(); };
  }, [lat, lng, label]);

  return <div ref={ref} className="h-64 md:h-full min-h-[16rem] w-full relative z-0" role="img" aria-label={label} />;
}
