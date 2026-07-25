import React from "react";
import { Compass, ArrowLeft } from "lucide-react";
import { navigate } from "../lib/router";

export default function InfoPageLayout({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-editorial-bg font-sans text-editorial-text">
      <header className="h-20 bg-editorial-bg border-b border-editorial-border flex items-center px-6 md:px-10">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-3 cursor-pointer">
          <div className="bg-editorial-primary p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Compass className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-serif italic tracking-tighter font-bold text-editorial-primary">
            EcoSafari<span className="text-zinc-400 not-italic">.</span>
          </h1>
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate("/"); }}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition mb-6 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
        </a>

        <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold block mb-2">{kicker}</span>
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mb-8">{title}</h2>

        <div className="prose-editorial text-sm leading-relaxed text-editorial-text space-y-5">
          {children}
        </div>
      </main>
    </div>
  );
}
