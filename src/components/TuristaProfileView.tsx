import React, { useState, useEffect } from "react";
import {
  User, MapPin, Languages, Coins, Heart, Ticket, Check, Copy, LoaderCircle,
  Pencil, X, Compass, Download, Trash2, ShieldAlert, Camera, ImagePlus, Send,
} from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { Pousada, Resgate, Turista, TuristaPost } from "../types";
import CountrySelect from "./CountrySelect";
import ImageUploadButton from "./ImageUploadButton";
import { readGpsFromFile, type GpsCoords } from "../lib/exifGps";

const parseCoverPosition = (pos?: string) => {
  const m = /^(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/.exec(pos || "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
};
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

interface VisitedPousada {
  pousadaId: string;
  pousadaName: string;
  checkIn: string;
  checkOut: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// Perfil completo do turista (não a versão compacta de dentro do login em
// TuristaAuthPanel.tsx) — capa + avatar sobreposto + duas colunas, no
// espírito visual de um perfil de rede social (Facebook), mas com a
// paleta editorial do site em vez do azul/cinza do Facebook.
export default function TuristaProfileView() {
  const { profile, supabase } = useTouristSession();
  // Espelho local do perfil, atualizado a cada salvamento bem-sucedido — o
  // hook useTouristSession só busca /api/turista/me uma vez quando a sessão
  // vira "turista"; sem isso, editar o perfil e sair do modo de edição
  // continuaria mostrando os dados antigos até recarregar a página.
  const [localProfile, setLocalProfile] = useState<Turista | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", whatsapp: "", country: "", language: "", age: "", preferences: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [coverError, setCoverError] = useState("");

  const [favoritos, setFavoritos] = useState<Pousada[] | null>(null);
  const [visitados, setVisitados] = useState<VisitedPousada[] | null>(null);
  const [resgates, setResgates] = useState<Resgate[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [posts, setPosts] = useState<TuristaPost[] | null>(null);
  const [postText, setPostText] = useState("");
  const [postPhotoUrl, setPostPhotoUrl] = useState("");
  // Local da foto do post: preenchido sozinho pelo GPS da foto (EXIF); sem
  // GPS na foto, o turista pode usar a localização do aparelho ou digitar.
  const [postCoords, setPostCoords] = useState<GpsCoords | null>(null);
  const [postLocation, setPostLocation] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationHint, setLocationHint] = useState("");
  // Ajuste do enquadramento da capa (arrastar a foto).
  const [adjustingCover, setAdjustingCover] = useState(false);
  const [coverPos, setCoverPos] = useState({ x: 50, y: 50 });
  const coverDrag = React.useRef<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLocalProfile(profile);
    setForm({
      name: profile.name || "",
      whatsapp: profile.whatsapp || "",
      country: profile.country || "",
      language: profile.language || "",
      age: profile.age ? String(profile.age) : "",
      preferences: profile.preferences || "",
    });
  }, [profile]);

  useEffect(() => {
    Promise.all([
      adminFetch("/api/turista/favoritos").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/visitados").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/resgates").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/posts").then(r => (r.ok ? r.json() : [])),
    ]).then(([f, v, r, p]) => {
      setFavoritos(f);
      setVisitados(v);
      setResgates(r);
      setPosts(p);
    });
  }, []);

  const saveProfile = async (overrides?: Partial<{ photoUrl: string; coverPhotoUrl: string; coverPosition: string }>): Promise<Turista | null> => {
    const body = {
      name: form.name,
      whatsapp: form.whatsapp,
      country: form.country,
      language: form.language,
      age: Number(form.age),
      preferences: form.preferences,
      ...(overrides?.photoUrl !== undefined ? { photoUrl: overrides.photoUrl } : {}),
      ...(overrides?.coverPhotoUrl !== undefined ? { coverPhotoUrl: overrides.coverPhotoUrl } : {}),
      ...(overrides?.coverPosition !== undefined ? { coverPosition: overrides.coverPosition } : {}),
    };
    const res = await adminFetch("/api/turista/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const updated = await res.json();
    setLocalProfile(updated);
    return updated;
  };

  const handlePhotoUploaded = async (url: string) => {
    setPhotoError("");
    const updated = await saveProfile({ photoUrl: url });
    if (!updated) setPhotoError("Erro ao salvar sua foto. Tente novamente.");
  };

  const handleRemovePhoto = async () => {
    if (removingPhoto || !confirm("Remover sua foto de perfil?")) return;
    setPhotoError("");
    setRemovingPhoto(true);
    try {
      const updated = await saveProfile({ photoUrl: "" });
      if (!updated) setPhotoError("Erro ao remover sua foto. Tente novamente.");
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handleCoverUploaded = async (url: string) => {
    setCoverError("");
    // Foto nova começa centralizada e já abre o ajuste de enquadramento.
    const updated = await saveProfile({ coverPhotoUrl: url, coverPosition: "50% 50%" });
    if (!updated) {
      setCoverError("Erro ao salvar a foto de capa. Tente novamente.");
      return;
    }
    setCoverPos({ x: 50, y: 50 });
    setAdjustingCover(true);
  };

  const startCoverAdjust = () => {
    setCoverPos(parseCoverPosition(localProfile?.coverPosition));
    setAdjustingCover(true);
  };
  const saveCoverPosition = async () => {
    const updated = await saveProfile({ coverPosition: `${coverPos.x}% ${coverPos.y}%` });
    if (!updated) {
      setCoverError("Erro ao salvar o enquadramento. Tente novamente.");
      return;
    }
    setAdjustingCover(false);
  };
  // Arrastar a foto para baixo mostra mais da parte de cima (y diminui).
  const onCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!adjustingCover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    coverDrag.current = { startX: e.clientX, startY: e.clientY, x: coverPos.x, y: coverPos.y, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = coverDrag.current;
    if (!adjustingCover || !d) return;
    setCoverPos({
      x: clampPct(d.x - ((e.clientX - d.startX) / d.w) * 100),
      y: clampPct(d.y - ((e.clientY - d.startY) / d.h) * 150),
    });
  };
  const onCoverPointerUp = () => { coverDrag.current = null; };

  const lookupPlaceName = async (coords: GpsCoords) => {
    try {
      const res = await fetch(`/api/geo/reverse?lat=${coords.latitude}&lng=${coords.longitude}`);
      const body = await res.json().catch(() => ({}));
      if (body.name) setPostLocation(prev => prev || body.name);
    } catch { /* fica só com as coordenadas */ }
  };
  const handlePostFile = async (file: File) => {
    setLocationHint("");
    const coords = await readGpsFromFile(file);
    if (coords) {
      setPostCoords(coords);
      setPostLocation("");
      lookupPlaceName(coords);
    } else {
      setLocationHint("Esta foto não tem localização gravada. Use sua localização atual ou digite o lugar.");
    }
  };
  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setLocationHint("Seu navegador não permite pegar a localização. Digite o lugar.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 };
        setPostCoords(coords);
        setLocationHint("");
        setLocating(false);
        lookupPlaceName(coords);
      },
      () => {
        setLocating(false);
        setLocationHint("Não foi possível pegar sua localização. Digite o lugar.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const clearPostLocation = () => {
    setPostCoords(null);
    setPostLocation("");
    setLocationHint("");
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await saveProfile();
      if (!updated) {
        setSaveError("Erro ao salvar seu perfil. Tente novamente.");
        return;
      }
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFavorite = async (pousadaId: string) => {
    setFavoritos(prev => (prev || []).filter(p => p.id !== pousadaId));
    await adminFetch(`/api/turista/favoritos/${pousadaId}`, { method: "DELETE" });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting || (!postText.trim() && !postPhotoUrl)) return;
    setPosting(true);
    setPostError("");
    try {
      const res = await adminFetch("/api/turista/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: postText.trim(),
          photoUrl: postPhotoUrl || undefined,
          location: postLocation.trim() || undefined,
          latitude: postCoords?.latitude,
          longitude: postCoords?.longitude,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPostError(body.error || "Erro ao publicar. Tente novamente.");
        return;
      }
      const newPost = await res.json();
      setPosts(prev => [newPost, ...(prev || [])]);
      setPostText("");
      setPostPhotoUrl("");
      clearPostLocation();
    } catch {
      setPostError("Erro ao publicar. Tente novamente.");
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    setPosts(prev => (prev || []).filter(p => p.id !== id));
    await adminFetch(`/api/turista/posts/${id}`, { method: "DELETE" });
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/");
  };

  // Direito de acesso/portabilidade (LGPD) — baixa tudo que está vinculado
  // a esta conta num arquivo só, sem precisar pedir pra equipe.
  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await adminFetch("/api/turista/me/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecosafari-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // Direito de eliminação (LGPD) — irreversível, por isso exige digitar
  // "EXCLUIR" antes do botão de fato liberar, em vez de um simples clique.
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "EXCLUIR" || deletingAccount) return;
    setDeletingAccount(true);
    try {
      const res = await adminFetch("/api/turista/me", { method: "DELETE" });
      if (!res.ok) {
        setDeletingAccount(false);
        return;
      }
      if (supabase) await supabase.auth.signOut();
      navigate("/");
    } catch {
      setDeletingAccount(false);
    }
  };

  if (!localProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Capa + avatar sobreposto — mesma ideia visual de um perfil do
          Facebook, com a paleta editorial do site em vez de azul/cinza. */}
      <div className="relative">
        <div
          className={`h-48 md:h-64 bg-gradient-to-br from-editorial-primary via-emerald-800 to-editorial-primary/70 overflow-hidden relative ${adjustingCover ? "cursor-grab active:cursor-grabbing touch-none select-none" : ""}`}
          onPointerDown={onCoverPointerDown}
          onPointerMove={onCoverPointerMove}
          onPointerUp={onCoverPointerUp}
          onPointerCancel={onCoverPointerUp}
        >
          {localProfile.coverPhotoUrl && (
            <img
              src={localProfile.coverPhotoUrl}
              alt="Capa do perfil"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: adjustingCover ? `${coverPos.x}% ${coverPos.y}%` : localProfile.coverPosition || "50% 50%" }}
            />
          )}
          {adjustingCover && (
            <span className="absolute inset-x-0 bottom-3 mx-auto w-fit bg-black/60 text-white text-[11px] font-semibold px-3 py-1 rounded-full pointer-events-none">
              Arraste a foto para enquadrar
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-2">
          {adjustingCover ? (
            <>
              <button type="button" onClick={() => setAdjustingCover(false)} className="bg-white/90 text-editorial-text text-[11px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-white">Cancelar</button>
              <button type="button" onClick={saveCoverPosition} className="bg-editorial-primary text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer hover:opacity-90">Salvar posição</button>
            </>
          ) : (
            <>
              {localProfile.coverPhotoUrl && (
                <button type="button" onClick={startCoverAdjust} className="bg-white/90 text-emerald-700 border border-emerald-600/40 text-[11px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-white">Ajustar posição</button>
              )}
              <ImageUploadButton label="Editar capa" onUploaded={handleCoverUploaded} />
            </>
          )}
        </div>

        <div className="px-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-14 sm:-mt-12">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="relative">
                {localProfile.photoUrl ? (
                  <img src={localProfile.photoUrl} alt={localProfile.name} className="w-28 h-28 rounded-full object-cover border-4 border-editorial-bg shadow-md" />
                ) : (
                  <span className="w-28 h-28 rounded-full bg-editorial-primary text-white text-3xl font-serif font-bold flex items-center justify-center border-4 border-editorial-bg shadow-md">
                    {initials(localProfile.name)}
                  </span>
                )}
                <div className="absolute bottom-0 right-0">
                  <ImageUploadButton compact label="Trocar foto" icon={<Camera className="h-3.5 w-3.5" />} onUploaded={handlePhotoUploaded} />
                </div>
              </div>
              {localProfile.photoUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={removingPhoto}
                  className="text-editorial-muted hover:text-red-600 text-[9px] uppercase tracking-widest font-bold transition cursor-pointer disabled:opacity-60"
                >
                  {removingPhoto ? "Removendo..." : "Remover foto"}
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0 sm:pb-2">
              <h1 className="text-2xl font-serif font-bold text-editorial-text">{localProfile.name}</h1>
              <p className="text-editorial-primary text-sm font-medium italic">Cada turista é único aqui na EcoSafari</p>
            </div>

            <div className="flex items-center gap-3 sm:pb-2 flex-shrink-0">
              <span className="flex items-center gap-1.5 bg-editorial-primary/5 border border-editorial-primary/15 text-editorial-primary font-bold text-sm px-3 py-1.5 rounded-full">
                <Coins className="h-4 w-4" /> {localProfile.coins ?? 0} Jaguars
              </span>
              <button
                onClick={handleLogout}
                className="text-editorial-muted hover:text-red-600 text-[10px] uppercase tracking-widest font-bold transition cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>

          {(localProfile.country || localProfile.language || typeof localProfile.age === "number") && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-editorial-muted">
              {localProfile.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {localProfile.country}</span>}
              {localProfile.language && <span className="flex items-center gap-1"><Languages className="h-3 w-3" /> {localProfile.language}</span>}
              {typeof localProfile.age === "number" && <span>{localProfile.age} anos</span>}
            </div>
          )}
          {(photoError || coverError) && <p className="text-red-600 text-[11px] font-medium mt-1">{photoError || coverError}</p>}

          {/* Stats rápidas */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-editorial-border text-center max-w-md">
            <div>
              <span className="block text-xl font-serif font-bold text-editorial-primary">{favoritos?.length ?? "–"}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Favoritas</span>
            </div>
            <div>
              <span className="block text-xl font-serif font-bold text-editorial-primary">{visitados?.length ?? "–"}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Visitadas</span>
            </div>
            <div>
              <span className="block text-xl font-serif font-bold text-editorial-primary">{posts?.length ?? "–"}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Posts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Coluna esquerda — dados + privacidade */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-editorial-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2">
                <User className="h-4 w-4" /> Meus dados
              </h2>
              <div className="flex items-center gap-3">
                {savedFlash && <span className="text-emerald-700 text-[11px] font-semibold flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Salvo</span>}
                <button
                  onClick={() => setEditing(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer"
                >
                  {editing ? <><X className="h-3.5 w-3.5" /> Cancelar</> : <><Pencil className="h-3.5 w-3.5" /> Editar</>}
                </button>
              </div>
            </div>

            {editing ? (
              <form onSubmit={handleSaveForm} className="flex flex-col gap-3">
                <input
                  type="text" required placeholder="Nome completo" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <input
                  type="tel" required placeholder="WhatsApp" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <CountrySelect required placeholder="País" value={form.country} onChange={v => setForm(p => ({ ...p, country: v }))} className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                <input
                  type="text" placeholder="Idioma preferido (opcional)" value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <input
                  type="number" min={1} placeholder="Idade (opcional)" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <textarea
                  rows={2} placeholder="O que você gosta de fazer em viagens? (opcional)" value={form.preferences}
                  onChange={e => setForm(p => ({ ...p, preferences: e.target.value }))}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none"
                />
                {saveError && <p className="text-red-600 text-xs font-medium">{saveError}</p>}
                <button
                  type="submit" disabled={saving}
                  className="mt-1 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
                >
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
                </button>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                <p><span className="text-editorial-muted text-xs block">WhatsApp</span> {localProfile.whatsapp || "—"}</p>
                <p><span className="text-editorial-muted text-xs block">País</span> {localProfile.country || "—"}</p>
                <p><span className="text-editorial-muted text-xs block">Idioma</span> {localProfile.language || "—"}</p>
                <p><span className="text-editorial-muted text-xs block">Idade</span> {localProfile.age || "—"}</p>
                <p><span className="text-editorial-muted text-xs block">Preferências</span> {localProfile.preferences || "Conte pra gente o que você gosta de fazer em viagens — edite seu perfil pra preencher."}</p>
              </div>
            )}
          </div>

          {/* Já visitou + Resgates */}
          <div className="bg-white border border-editorial-border rounded-lg p-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-3">
              <Compass className="h-4 w-4" /> Já visitou
            </h2>
            {visitados === null ? (
              <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
            ) : visitados.length === 0 ? (
              <p className="text-editorial-muted text-xs">Suas estadias confirmadas aparecem aqui.</p>
            ) : (
              <ul className="space-y-1.5">
                {visitados.map(v => (
                  <li key={v.pousadaId} className="text-sm text-editorial-text truncate flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-editorial-muted flex-shrink-0" /> {v.pousadaName}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-editorial-border rounded-lg p-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-3">
              <Ticket className="h-4 w-4" /> Meus resgates
            </h2>
            {resgates === null ? (
              <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
            ) : resgates.length === 0 ? (
              <p className="text-editorial-muted text-xs">Seus Jaguars podem virar desconto nas pousadas parceiras — veja as recompensas no perfil de cada uma.</p>
            ) : (
              <ul className="space-y-2">
                {resgates.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className={`font-mono font-bold ${r.status === "usado" ? "text-editorial-muted line-through" : "text-editorial-primary"}`}>{r.code}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${r.status === "usado" ? "bg-zinc-100 text-zinc-500" : "bg-emerald-50 text-emerald-700"}`}>
                        {r.status === "usado" ? "Usado" : "Pendente"}
                      </span>
                      {r.status === "pendente" && (
                        <button aria-label="Copiar código" onClick={() => handleCopyCode(r.code)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title="Copiar código">
                          {copiedCode === r.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Privacidade e dados — direitos de acesso/portabilidade e
              eliminação da LGPD, disponíveis pra pessoa exercer sozinha em
              vez de precisar pedir pra equipe. */}
          <div className="bg-white border border-editorial-border rounded-lg p-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-4">
              <ShieldAlert className="h-4 w-4" /> Privacidade e dados
            </h2>
            <div className="flex flex-col gap-3 pb-4 mb-4 border-b border-editorial-border">
              <div>
                <p className="text-editorial-text text-sm font-semibold">Baixar meus dados</p>
                <p className="text-editorial-muted text-xs">Perfil, favoritos, avaliações, resgates e reservas num arquivo só.</p>
              </div>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="flex items-center justify-center gap-1.5 border border-editorial-border text-editorial-text text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:bg-editorial-secondary transition cursor-pointer disabled:opacity-60"
              >
                {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Exportar
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <p className="text-editorial-text text-sm font-semibold">Excluir minha conta</p>
                <p className="text-editorial-muted text-xs">Remove seu perfil e login permanentemente.</p>
              </div>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center gap-1.5 border border-red-200 text-red-600 text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:bg-red-50 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir conta
                </button>
              ) : null}
            </div>

            {showDeleteConfirm && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-xs font-semibold mb-1">Essa ação não pode ser desfeita.</p>
                <p className="text-red-700 text-xs mb-3">Digite <span className="font-mono font-bold">EXCLUIR</span> abaixo para confirmar.</p>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    className="flex-1 border border-red-300 bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText.trim().toUpperCase() !== "EXCLUIR" || deletingAccount}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {deletingAccount ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Confirmar exclusão"}
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                      className="text-editorial-muted hover:text-editorial-text text-[11px] uppercase tracking-widest font-bold px-2 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita — posts + favoritos */}
        <div className="lg:col-span-3 space-y-6">
          {/* Compositor de post */}
          <div className="bg-white border border-editorial-border rounded-lg p-5">
            <form onSubmit={handleCreatePost} className="space-y-3">
              <div className="flex gap-3">
                {localProfile.photoUrl ? (
                  <img src={localProfile.photoUrl} alt={localProfile.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-editorial-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {initials(localProfile.name)}
                  </span>
                )}
                <textarea
                  rows={2}
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  placeholder="Compartilhe um momento da sua viagem..."
                  className="flex-1 border border-editorial-border bg-editorial-secondary/20 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none"
                />
              </div>
              {postPhotoUrl && (
                <div className="relative ml-[52px]">
                  <img src={postPhotoUrl} alt="Foto do post" className="max-h-48 rounded-md border border-editorial-border" />
                  <button aria-label="Remover foto" type="button" onClick={() => setPostPhotoUrl("")} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {(postPhotoUrl || postCoords || postLocation) && (
                <div className="ml-[52px] flex flex-wrap items-center gap-2 text-xs">
                  <MapPin className="h-3.5 w-3.5 text-editorial-primary flex-shrink-0" />
                  <input
                    type="text"
                    maxLength={120}
                    value={postLocation}
                    onChange={e => setPostLocation(e.target.value)}
                    placeholder={postCoords ? "Buscando o nome do lugar..." : "Onde a foto foi tirada? (opcional)"}
                    aria-label="Local da foto"
                    className="flex-1 min-w-[160px] border border-editorial-border bg-white px-2.5 py-1.5 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                  />
                  {!postCoords && (
                    <button type="button" onClick={useDeviceLocation} disabled={locating} className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer disabled:opacity-60">
                      {locating ? "Localizando..." : "Usar minha localização"}
                    </button>
                  )}
                  {(postCoords || postLocation) && (
                    <button type="button" onClick={clearPostLocation} aria-label="Remover local" className="text-editorial-muted hover:text-red-600 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                  )}
                  {locationHint && <p className="w-full text-[11px] text-editorial-muted">{locationHint}</p>}
                </div>
              )}
              {postError && <p className="text-red-600 text-xs font-medium ml-[52px]">{postError}</p>}
              <div className="flex items-center justify-between ml-[52px]">
                <ImageUploadButton label="Foto" icon={<ImagePlus className="h-3.5 w-3.5" />} onUploaded={setPostPhotoUrl} onFileSelected={handlePostFile} />
                <button
                  type="submit"
                  disabled={posting || (!postText.trim() && !postPhotoUrl)}
                  className="flex items-center gap-1.5 bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {posting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Publicar
                </button>
              </div>
            </form>
          </div>

          {/* Feed de posts */}
          {posts === null ? (
            <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
          ) : posts.length === 0 ? (
            <div className="bg-white border border-dashed border-editorial-border rounded-lg p-8 text-center">
              <Camera className="h-6 w-6 text-editorial-muted mx-auto mb-2" />
              <p className="text-editorial-muted text-xs">Nenhum post ainda — compartilhe um momento da sua próxima expedição.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <div key={post.id} className="bg-white border border-editorial-border rounded-lg p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      {localProfile.photoUrl ? (
                        <img src={localProfile.photoUrl} alt={localProfile.name} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <span className="w-9 h-9 rounded-full bg-editorial-primary text-white text-[11px] font-bold flex items-center justify-center">
                          {initials(localProfile.name)}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-bold text-editorial-text">{localProfile.name}</p>
                        <p className="text-editorial-muted text-[11px]">
                          {formatPostDate(post.createdAt)}
                          {post.location && (
                            <>
                              {" · "}
                              {typeof post.latitude === "number" && typeof post.longitude === "number" ? (
                                <a href={`https://www.openstreetmap.org/?mlat=${post.latitude}&mlon=${post.longitude}#map=13/${post.latitude}/${post.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-editorial-primary hover:underline">
                                  <MapPin className="h-3 w-3" />{post.location}
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{post.location}</span>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <button aria-label="Excluir post" onClick={() => handleDeletePost(post.id)} className="text-editorial-muted hover:text-red-600 transition cursor-pointer flex-shrink-0" title="Excluir post">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {post.text && <p className="text-editorial-text text-sm whitespace-pre-line mb-3">{post.text}</p>}
                  {post.photoUrl && <img src={post.photoUrl} alt="Foto do post" className="w-full rounded-md border border-editorial-border" />}
                </div>
              ))}
            </div>
          )}

          {/* Favoritos */}
          <div className="bg-white border border-editorial-border rounded-lg p-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4" /> Pousadas favoritas
            </h2>
            {favoritos === null ? (
              <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
            ) : favoritos.length === 0 ? (
              <p className="text-editorial-muted text-xs">Nenhuma pousada favoritada ainda — explore o catálogo e clique no coração de quem você mais curtiu.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {favoritos.map(p => (
                  <div key={p.id} className="flex items-center gap-3 border border-editorial-border rounded-md p-2.5 group">
                    <button
                      onClick={() => navigate(`/pousadas/${p.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="w-12 h-12 rounded bg-editorial-secondary flex-shrink-0 overflow-hidden">
                        {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-editorial-text truncate group-hover:text-editorial-primary transition">{p.name}</span>
                        <span className="block text-[11px] text-editorial-muted truncate">{p.location}</span>
                      </span>
                    </button>
                    <button aria-label="Remover dos favoritos"
                      onClick={() => handleRemoveFavorite(p.id)}
                      title="Remover dos favoritos"
                      className="text-editorial-muted hover:text-red-600 transition cursor-pointer flex-shrink-0 p-1"
                    >
                      <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
