import React, { useRef } from "react";
import { Mail, MessageSquare, Instagram } from "lucide-react";
import { navigate } from "../lib/router";
import { useI18n } from "../i18n/I18nProvider";
import BrandLogo from "./BrandLogo";

const COMPANY_CNPJ = (import.meta.env.VITE_COMPANY_CNPJ as string | undefined) || "00.000.000/0001-00 (definir antes do lançamento)";
const COMPANY_ADDRESS = (import.meta.env.VITE_COMPANY_ADDRESS as string | undefined) || "Endereço a definir — Cidade/UF";
const SUPPORT_EMAIL = "francainteligenciaindustrial@gmail.com";
const WHATSAPP = "5565999868334";

// Rodapé no estilo das landing pages de produto: o nome IPANTANAL gigante,
// cortado pela linha, que acende com um brilho verde seguindo o mouse
// (contorno + leve preenchimento, desenhados por máscara radial nas
// variáveis --mx/--my — sem re-render a cada movimento).
export default function SiteFooter() {
  const { t } = useI18n();
  const wordRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = wordRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(path);
  };
  const toSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.location.pathname !== "/") navigate("/");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  const linkCls = "text-[#A9B8B3] hover:text-white transition-colors";
  const colTitle = "text-white text-sm font-medium mb-4";

  return (
    <footer className="bg-[#060B0A] text-[#E8EFEC] font-sans overflow-hidden">
      {/* Nome gigante com brilho */}
      <div
        ref={wordRef}
        onPointerMove={onMove}
        className="ipantanal-wordmark relative max-w-7xl mx-auto px-6 md:px-10 pt-20 select-none"
        aria-hidden="true"
      >
        <div className="relative h-[0.62em] text-[clamp(72px,16vw,250px)] leading-none overflow-hidden">
          <span className="ipantanal-wordmark__base">IPANTANAL</span>
          <span className="ipantanal-wordmark__glow">IPANTANAL</span>
          <span className="ipantanal-wordmark__stroke">IPANTANAL</span>
        </div>
      </div>
      <div className="border-t border-white/10" />

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-14 grid grid-cols-2 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] gap-x-8 gap-y-10 text-sm">
        <div className="col-span-2 md:col-span-1 flex flex-col gap-5">
          <BrandLogo tone="dark" />
          <p className="text-[#A9B8B3] text-xs leading-relaxed max-w-[16rem]">{t("app.footer.tagline")}</p>
          <div className="flex items-center gap-2">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20Ipantanal`} aria-label="Email" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
              <Mail className="h-4 w-4" />
            </a>
            <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá, equipe Ipantanal!")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
              <MessageSquare className="h-4 w-4" />
            </a>
            <a href="https://instagram.com/ecosafari" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
              <Instagram className="h-4 w-4" />
            </a>
          </div>
        </div>

        <nav aria-label={t("footer.col.platform")}>
          <p className={colTitle}>{t("footer.col.platform")}</p>
          <ul className="space-y-3">
            <li><a href="/#catalogo" onClick={toSection("catalogo")} className={linkCls}>{t("footer.link.lodges")}</a></li>
            <li><a href="/#mapa" onClick={toSection("mapa")} className={linkCls}>{t("footer.link.map")}</a></li>
            <li><a href="/turista" onClick={go("/turista")} className={linkCls}>{t("footer.link.tourist")}</a></li>
          </ul>
        </nav>

        <nav aria-label={t("footer.col.partners")}>
          <p className={colTitle}>{t("footer.col.partners")}</p>
          <ul className="space-y-3">
            <li><a href="/seja-parceiro" onClick={go("/seja-parceiro")} className={linkCls}>{t("footer.link.join")}</a></li>
            <li><a href="/parceiro" onClick={go("/parceiro")} className={linkCls}>{t("footer.link.portal")}</a></li>
            <li><a href="/status-candidatura" onClick={go("/status-candidatura")} className={linkCls}>{t("app.footer.candidate")}</a></li>
          </ul>
        </nav>

        <nav aria-label={t("footer.col.company")}>
          <p className={colTitle}>{t("footer.col.company")}</p>
          <ul className="space-y-3">
            <li><a href="/sobre" onClick={go("/sobre")} className={linkCls}>{t("app.footer.about")}</a></li>
            <li><a href="/faq" onClick={go("/faq")} className={linkCls}>{t("app.footer.faq")}</a></li>
          </ul>
        </nav>

        <nav aria-label={t("footer.col.legal")}>
          <p className={colTitle}>{t("footer.col.legal")}</p>
          <ul className="space-y-3">
            <li><a href="/privacidade" onClick={go("/privacidade")} className={linkCls}>{t("app.footer.privacy")}</a></li>
            <li><a href="/termos" onClick={go("/termos")} className={linkCls}>{t("app.footer.terms")}</a></li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row gap-2 md:items-center md:justify-between text-xs text-[#8FA39C]">
          <span>© {new Date().getFullYear()} Ipantanal</span>
          <span>CNPJ: {COMPANY_CNPJ} · {COMPANY_ADDRESS}</span>
        </div>
      </div>
    </footer>
  );
}
