export type VideoSource =
  | { kind: "iframe"; src: string; provider: "youtube" | "drive" }
  | { kind: "file"; src: string };

// Converte o link colado pelo gestor (YouTube, Google Drive ou arquivo de
// vídeo direto) no formato que dá pra tocar dentro do site. Instagram não
// permite incorporar vídeo sem o script deles — retorna null nesse caso.
export function parseVideoUrl(raw: string | undefined | null): VideoSource | null {
  const url = (raw || "").trim();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? parsed.pathname.slice(1)
        : parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` };
  }

  if (host === "drive.google.com") {
    const id = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || parsed.searchParams.get("id");
    if (!id || !/^[\w-]{10,100}$/.test(id)) return null;
    return { kind: "iframe", provider: "drive", src: `https://drive.google.com/file/d/${id}/preview` };
  }

  if (/\.(mp4|webm|mov)(\?|$)/i.test(parsed.pathname) || host.endsWith(".supabase.co")) {
    return { kind: "file", src: url };
  }
  return null;
}
