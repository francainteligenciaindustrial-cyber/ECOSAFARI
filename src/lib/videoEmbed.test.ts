import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "./videoEmbed";

describe("parseVideoUrl", () => {
  it("converte links do YouTube para o embed sem cookies", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "iframe", provider: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    });
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.src).toContain("/embed/dQw4w9WgXcQ");
    expect(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.src).toContain("/embed/dQw4w9WgXcQ");
  });

  it("converte links de compartilhamento do Google Drive para o preview", () => {
    expect(parseVideoUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing")).toEqual({
      kind: "iframe", provider: "drive", src: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview",
    });
  });

  it("aceita arquivo de vídeo direto em https", () => {
    expect(parseVideoUrl("https://xyz.supabase.co/storage/v1/object/public/videos/a.mp4")).toEqual({
      kind: "file", src: "https://xyz.supabase.co/storage/v1/object/public/videos/a.mp4",
    });
  });

  it("rejeita vazio, http, javascript e sites não suportados", () => {
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl("http://example.com/a.mp4")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("https://www.instagram.com/reel/abc/")).toBeNull();
    expect(parseVideoUrl("https://www.youtube.com/watch?v=<script>")).toBeNull();
  });
});
