import React, { useState, useEffect } from "react";
import {
  User, MapPin, Languages, Coins, Heart, Ticket, Check, Copy, LoaderCircle,
  Pencil, X, Sparkles, Compass, Download, Trash2, ShieldAlert,
} from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { TOURIST_INTEREST_GROUPS } from "../lib/touristInterests";
import { Pousada, Resgate, Turista } from "../types";
import ImageUploadButton from "./ImageUploadButton";

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

// Perfil completo do turista (não a versão compacta de dentro do login em
// TuristaAuthPanel.tsx) — pensado como um "perfil social" (favoritos,
// interesses, histórico), mas seguindo a estética editorial do site, não a
// do Facebook/Instagram em si. Interesses (passeios/aventuras, fauna/flora)
// alimentam o cruzamento que a IA do chat faz para sugerir guia/pousada.
export default function TuristaProfileView() {
  const { profile, supabase } = useTouristSession();
  // Espelho local do perfil, atualizado a cada salvamento bem-sucedido — o
  // hook useTouristSession só busca /api/turista/me uma vez quando a sessão
  // vira "turista"; sem isso, editar o perfil e sair do modo de edição
  // continuaria mostrando os dados antigos até recarregar a página.
  const [localProfile, setLocalProfile] = useState<Turista | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", whatsapp: "", country: "", language: "", age: "", preferences: "" });
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [togglingInterest, setTogglingInterest] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [removingPhoto, setRemovingPhoto] = useState(false);

  const [favoritos, setFavoritos] = useState<Pousada[] | null>(null);
  const [visitados, setVisitados] = useState<VisitedPousada[] | null>(null);
  const [resgates, setResgates] = useState<Resgate[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    setInterests(profile.interests || []);
  }, [profile]);

  useEffect(() => {
    Promise.all([
      adminFetch("/api/turista/favoritos").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/visitados").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/resgates").then(r => (r.ok ? r.json() : [])),
    ]).then(([f, v, r]) => {
      setFavoritos(f);
      setVisitados(v);
      setResgates(r);
    });
  }, []);

  const saveProfile = async (overrides?: Partial<{ interests: string[]; photoUrl: string }>): Promise<Turista | null> => {
    const body = {
      name: form.name,
      whatsapp: form.whatsapp,
      country: form.country,
      language: form.language,
      age: Number(form.age),
      preferences: form.preferences,
      interests: overrides?.interests ?? interests,
      ...(overrides?.photoUrl !== undefined ? { photoUrl: overrides.photoUrl } : {}),
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

  // Marcar/desmarcar um interesse salva na hora — igual "curtir" algo num
  // perfil social, sem precisar entrar no modo de edição pra isso.
  const handleToggleInterest = async (interest: string) => {
    if (togglingInterest) return;
    const next = interests.includes(interest) ? interests.filter(i => i !== interest) : [...interests, interest];
    setTogglingInterest(interest);
    setInterests(next);
    try {
      const updated = await saveProfile({ interests: next });
      if (!updated) setInterests(interests); // reverte se falhou
    } finally {
      setTogglingInterest(null);
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
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header do perfil */}
      <div className="bg-white border border-editorial-border rounded-lg p-6 md:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {localProfile.photoUrl ? (
              <img src={localProfile.photoUrl} alt={localProfile.name} className="w-20 h-20 rounded-full object-cover border border-editorial-border" />
            ) : (
              <span className="w-20 h-20 rounded-full bg-editorial-primary text-white text-2xl font-serif font-bold flex items-center justify-center">
                {initials(localProfile.name)}
              </span>
            )}
            <ImageUploadButton label={localProfile.photoUrl ? "Trocar foto" : "Enviar foto"} onUploaded={handlePhotoUploaded} />
            {localProfile.photoUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={removingPhoto}
                className="text-red-600 hover:text-red-700 text-[10px] uppercase tracking-widest font-bold transition cursor-pointer disabled:opacity-60"
              >
                {removingPhoto ? "Removendo..." : "Remover foto"}
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-serif font-bold text-editorial-text">{localProfile.name}</h1>
            <p className="text-editorial-muted text-xs">{localProfile.email}</p>
            {photoError && <p className="text-red-600 text-[11px] font-medium mt-1">{photoError}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-editorial-muted">
              {localProfile.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {localProfile.country}</span>}
              {localProfile.language && <span className="flex items-center gap-1"><Languages className="h-3 w-3" /> {localProfile.language}</span>}
              {typeof localProfile.age === "number" && <span>{localProfile.age} anos</span>}
            </div>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2">
            <span className="flex items-center gap-1.5 bg-editorial-primary/5 border border-editorial-primary/15 text-editorial-primary font-bold text-sm px-3 py-1.5 rounded-full">
              <Coins className="h-4 w-4" /> {localProfile.coins ?? 0} Coins
            </span>
            <button
              onClick={handleLogout}
              className="text-editorial-muted hover:text-red-600 text-[10px] uppercase tracking-widest font-bold transition cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-editorial-border text-center">
          <div>
            <span className="block text-xl font-serif font-bold text-editorial-primary">{favoritos?.length ?? "–"}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Favoritas</span>
          </div>
          <div>
            <span className="block text-xl font-serif font-bold text-editorial-primary">{visitados?.length ?? "–"}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Visitadas</span>
          </div>
          <div>
            <span className="block text-xl font-serif font-bold text-editorial-primary">{interests.length}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Interesses</span>
          </div>
        </div>
      </div>

      {/* Dados do perfil — editável */}
      <div className="bg-white border border-editorial-border rounded-lg p-6 md:p-8 mb-6">
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
          <form onSubmit={handleSaveForm} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text" required placeholder="Nome completo" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary sm:col-span-2"
            />
            <input
              type="tel" required placeholder="WhatsApp" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="text" required placeholder="País" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="text" required placeholder="Idioma preferido" value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="number" required min={1} placeholder="Idade" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <textarea
              required rows={2} placeholder="O que você gosta de fazer em viagens?" value={form.preferences}
              onChange={e => setForm(p => ({ ...p, preferences: e.target.value }))}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none sm:col-span-2"
            />
            {saveError && <p className="text-red-600 text-xs font-medium sm:col-span-2">{saveError}</p>}
            <button
              type="submit" disabled={saving}
              className="sm:col-span-2 mt-1 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <p><span className="text-editorial-muted text-xs block">WhatsApp</span> {localProfile.whatsapp}</p>
            <p><span className="text-editorial-muted text-xs block">País</span> {localProfile.country}</p>
            <p><span className="text-editorial-muted text-xs block">Idioma</span> {localProfile.language || "—"}</p>
            <p><span className="text-editorial-muted text-xs block">Idade</span> {localProfile.age}</p>
            <p className="sm:col-span-2"><span className="text-editorial-muted text-xs block">Preferências</span> {localProfile.preferences}</p>
          </div>
        )}
      </div>

      {/* Interesses — categorias fixas que alimentam o cruzamento da IA */}
      <div className="bg-white border border-editorial-border rounded-lg p-6 md:p-8 mb-6">
        <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4" /> Meus interesses
        </h2>
        <p className="text-editorial-muted text-xs mb-5">
          Marque o que mais te interessa — usamos isso pra te sugerir guias, pousadas e roteiros mais alinhados com o que você quer viver no Pantanal.
        </p>
        {TOURIST_INTEREST_GROUPS.map(group => (
          <div key={group.label} className="mb-4 last:mb-0">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">{group.label}</h3>
            <div className="flex flex-wrap gap-2">
              {group.options.map(option => {
                const active = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleToggleInterest(option)}
                    disabled={togglingInterest === option}
                    className={`px-3.5 py-1.5 rounded-full border text-[11px] font-bold transition cursor-pointer disabled:opacity-60 ${
                      active
                        ? "bg-editorial-primary text-white border-editorial-primary shadow-sm"
                        : "bg-white text-editorial-text border-editorial-border hover:bg-editorial-secondary"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Favoritos */}
      <div className="bg-white border border-editorial-border rounded-lg p-6 md:p-8 mb-6">
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
                <button
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

      {/* Visitados + Resgates lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white border border-editorial-border rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4" /> Já visitou
          </h2>
          {visitados === null ? (
            <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
          ) : visitados.length === 0 ? (
            <p className="text-editorial-muted text-xs">Suas estadias confirmadas aparecem aqui.</p>
          ) : (
            <ul className="space-y-1.5">
              {visitados.map(v => (
                <li key={v.pousadaId} className="text-sm text-editorial-text truncate flex items-center gap-2">
                  <Compass className="h-3.5 w-3.5 text-editorial-muted flex-shrink-0" /> {v.pousadaName}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-editorial-border rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-4">
            <Ticket className="h-4 w-4" /> Meus resgates
          </h2>
          {resgates === null ? (
            <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
          ) : resgates.length === 0 ? (
            <p className="text-editorial-muted text-xs">Suas Coins podem virar desconto nas pousadas parceiras — veja as recompensas no perfil de cada uma.</p>
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
                      <button onClick={() => handleCopyCode(r.code)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title="Copiar código">
                        {copiedCode === r.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Privacidade e dados — direitos de acesso/portabilidade e
          eliminação da LGPD, disponíveis pra pessoa exercer sozinha em vez
          de precisar pedir pra equipe. */}
      <div className="bg-white border border-editorial-border rounded-lg p-6 md:p-8 mt-6">
        <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-4">
          <ShieldAlert className="h-4 w-4" /> Privacidade e dados
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-editorial-border">
          <div>
            <p className="text-editorial-text text-sm font-semibold">Baixar meus dados</p>
            <p className="text-editorial-muted text-xs">Um arquivo com tudo que temos vinculado à sua conta: perfil, favoritos, avaliações, resgates e reservas.</p>
          </div>
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="flex items-center gap-1.5 border border-editorial-border text-editorial-text text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:bg-editorial-secondary transition cursor-pointer disabled:opacity-60 flex-shrink-0"
          >
            {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-editorial-text text-sm font-semibold">Excluir minha conta</p>
            <p className="text-editorial-muted text-xs">Remove seu perfil e login permanentemente. Avaliações já publicadas ficam anônimas em vez de apagadas.</p>
          </div>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:bg-red-50 transition cursor-pointer flex-shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir conta
            </button>
          ) : null}
        </div>

        {showDeleteConfirm && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800 text-xs font-semibold mb-1">Essa ação não pode ser desfeita.</p>
            <p className="text-red-700 text-xs mb-3">Digite <span className="font-mono font-bold">EXCLUIR</span> abaixo para confirmar.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                className="flex-1 border border-red-300 bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.trim().toUpperCase() !== "EXCLUIR" || deletingAccount}
                className="bg-red-600 hover:bg-red-700 text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 flex-shrink-0"
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
        )}
      </div>
    </div>
  );
}
