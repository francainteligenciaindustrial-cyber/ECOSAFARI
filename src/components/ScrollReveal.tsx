import { useEffect } from "react";

// Efeito "revelar ao rolar" (scroll reveal): os blocos de cada seção sobem e
// aparecem suavemente quando entram na tela — no estilo das landing pages de
// marketplaces. Não precisa marcar elemento por elemento: dentro do
// container indicado, cada filho direto do conteúdo de uma <section> é
// animado, e os itens de grades/listas entram em sequência (escalonados).
//
// Cuidados:
//  - só anima o que ainda está ABAIXO da tela; o que já aparece ao abrir a
//    página fica parado (nada de conteúdo "piscando" no carregamento);
//  - respeita "reduzir movimento" do sistema (acessibilidade);
//  - terminado o efeito, remove as classes — nenhum transform fica no
//    elemento (não atrapalha mapa, sticky, modais);
//  - conteúdo que chega depois (catálogo carregando) é observado também.
//  - [data-no-reveal] desliga o efeito num bloco e em tudo dentro dele.

const TARGETS = "section > div > *, section > div > div > *";
const STAGGER_PARENT = /\bgrid\b|\bflex-wrap\b/;
const MAX_STAGGER = 6;

export default function ScrollReveal({ rootId }: { rootId: string }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.getElementById(rootId);
    if (!root) return;

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          observer.unobserve(el);
          el.classList.add("reveal-in");
          const done = () => {
            el.classList.remove("reveal-init", "reveal-in");
            el.style.removeProperty("transition-delay");
          };
          el.addEventListener("transitionend", done, { once: true });
          window.setTimeout(done, 1600); // garantia, caso o transitionend não dispare
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    const prepare = (el: HTMLElement, delayIndex: number) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.closest("[data-no-reveal]")) return;
      // Um bloco já animado leva os filhos junto — não anima de novo por dentro.
      if (el.parentElement?.closest(".reveal-init")) return;
      // Já visível ao abrir: não anima.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      el.classList.add("reveal-init");
      if (delayIndex > 0) el.style.transitionDelay = `${Math.min(delayIndex, MAX_STAGGER) * 90}ms`;
      observer.observe(el);
    };

    const scan = () => {
      root.querySelectorAll<HTMLElement>(TARGETS).forEach(el => {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
        const parent = el.parentElement;
        const staggered = parent && STAGGER_PARENT.test(parent.className || "");
        if (staggered) {
          // Itens de grade: cada um com um pequeno atraso em relação ao anterior.
          Array.from(parent!.children).forEach((child, i) => prepare(child as HTMLElement, i));
        } else {
          prepare(el, 0);
        }
      });
    };

    scan();
    let pending = 0;
    const mutations = new MutationObserver(() => {
      if (pending) return;
      pending = window.requestAnimationFrame(() => {
        pending = 0;
        scan();
      });
    });
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      if (pending) window.cancelAnimationFrame(pending);
      root.querySelectorAll(".reveal-init").forEach(el => el.classList.remove("reveal-init", "reveal-in"));
    };
  }, [rootId]);

  return null;
}
