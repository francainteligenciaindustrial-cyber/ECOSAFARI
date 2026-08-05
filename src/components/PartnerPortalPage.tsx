import React, { useState, useEffect } from "react";
import { Compass, LogOut, LoaderCircle, Lock, Save, Check, ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { PartnerProfileResponse } from "../types";
import { navigate } from "../lib/router";
import ImageListEditor from "./ImageListEditor";
import TagInput from "./TagInput";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";

// Self-service portal for a partner (pousada/atração/guia) to edit only
// their own profile — no access to bookings, other partners, or anything
// admin-only. Auth is the same Supabase Auth used by the admin login, just
// checking app_metadata.role === "partner" instead of "admin"; the actual
// enforcement lives server-side in requirePartnerAccess (server.ts), this
// page only decides what to render.
export default function PartnerPortalPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isPartner, setIsPartner] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [profile, setProfile] = useState<PartnerProfileResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setIsPartner(data.session?.user?.app_metadata?.role === "partner");
        setCheckingSession(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setIsPartner(session?.user?.app_metadata?.role === "partner");
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isPartner) return;
    setLoadingProfile(true);
    setProfileError("");
    adminFetch("/api/my-partner-profile")
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Erro ao carregar seu perfil.");
        }
        return res.json();
      })
      .then((data: PartnerProfileResponse) => {
        setProfile(data);
        if (data.partnerType === "pousada" && data.pousada) {
          setForm({
            description: data.pousada.description,
            longDescription: data.pousada.longDescription || "",
            images: [...(data.pousada.images || [])],
            features: [...(data.pousada.features || [])],
            activities: [...(data.pousada.activities || [])],
          });
        } else if (data.partnerType === "atracao" && data.atracao) {
          setForm({
            description: data.atracao.description,
            images: [...(data.atracao.images || [])],
            menu: (data.atracao.menu || []).map(m => ({ title: m.item, price: m.price })) as ExperienceDraft[],
          });
        } else if (data.partnerType === "guia" && data.guia) {
          setForm({
            bio: data.guia.bio || "",
            languages: [...(data.guia.languages || [])],
            specialty: [...(data.guia.specialty || [])],
            interests: [...(data.guia.interests || [])],
            status: data.guia.status,
          });
        }
      })
      .catch(err => setProfileError(err.message || "Erro ao carregar seu perfil."))
      .finally(() => setLoadingProfile(false));
  }, [isPartner]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoggingIn(true);
    setLoginError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoginError("Email ou senha inválidos.");
      setLoggingIn(false);
      return;
    }
    if (data.user.app_metadata?.role !== "partner") {
      await supabase.auth.signOut();
      setLoginError("Esta conta não tem acesso de parceiro. Fale com a equipe EcoSafari.");
      setLoggingIn(false);
      return;
    }
    setIsPartner(true);
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsPartner(false);
    setProfile(null);
    setForm(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form) return;
    setSaving(true);
    setSaved(false);
    try {
      let endpoint = "";
      let payload: any = {};
      if (profile.partnerType === "pousada") {
        endpoint = `/api/pousadas/${profile.partnerId}`;
        payload = {
          description: form.description,
          longDescription: form.longDescription,
          images: form.images.map((i: string) => i.trim()).filter(Boolean),
          features: form.features,
          activities: form.activities,
        };
      } else if (profile.partnerType === "atracao") {
        endpoint = `/api/atracoes/${profile.partnerId}`;
        payload = {
          description: form.description,
          images: form.images.map((i: string) => i.trim()).filter(Boolean),
          menu: form.menu.filter((m: ExperienceDraft) => m.title.trim()).map((m: ExperienceDraft) => ({ item: m.title.trim(), price: m.price || 0 })),
        };
      } else {
        endpoint = `/api/guides/${profile.partnerId}`;
        payload = { bio: form.bio, languages: form.languages, specialty: form.specialty, interests: form.interests, status: form.status };
      }
      const res = await adminFetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (checkingSession || !supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  const header = (
    <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-editorial-border bg-white">
      <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
        <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center">
          <Compass className="h-4 w-4" />
        </div>
        <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
      </a>
      {isPartner && (
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      )}
    </header>
  );

  if (!isPartner) {
    return (
      <div className="min-h-screen bg-editorial-bg font-sans">
        {header}
        <div className="flex items-center justify-center px-6 py-16">
          <div className="max-w-sm w-full bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-editorial-primary" />
              <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Portal do Parceiro</h1>
            </div>
            <p className="text-editorial-muted text-xs mb-6">Entre com o acesso que a equipe EcoSafari criou pra você editar seu próprio perfil.</p>
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <input
                type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="password" required placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              {loginError && <p className="text-red-600 text-xs font-medium">{loginError}</p>}
              <button
                type="submit" disabled={loggingIn}
                className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
              >
                {loggingIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-editorial-bg font-sans">
      {header}
      <div className="max-w-2xl mx-auto px-6 py-10">
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition mb-6 cursor-pointer">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
        </a>
        <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-1">Meu Perfil</h1>
        <p className="text-editorial-muted text-xs mb-8">
          {profile?.pousada?.name || profile?.atracao?.name || profile?.guia?.name || "Edite as informações que aparecem pra quem visita a EcoSafari."}
        </p>

        {loadingProfile ? (
          <div className="flex items-center justify-center py-16 text-editorial-muted gap-2">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : profileError ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{profileError}</div>
        ) : profile && form ? (
          <form onSubmit={handleSave} className="bg-white border border-editorial-border rounded-lg p-6 space-y-5">
            {profile.partnerType === "pousada" && (
              <>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Descrição Curta</label>
                  <input type="text" value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Descrição Completa</label>
                  <textarea rows={4} value={form.longDescription} onChange={e => setForm((p: any) => ({ ...p, longDescription: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                </div>
                <ImageListEditor label="Imagens" value={form.images} onChange={images => setForm((p: any) => ({ ...p, images }))} />
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Estrutura & Comodidades</label>
                  <TagInput value={form.features} onChange={features => setForm((p: any) => ({ ...p, features }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Atividades</label>
                  <TagInput value={form.activities} onChange={activities => setForm((p: any) => ({ ...p, activities }))} placeholder="Digite e pressione Enter" />
                </div>
              </>
            )}

            {profile.partnerType === "atracao" && (
              <>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Descrição</label>
                  <textarea rows={4} value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                </div>
                <ImageListEditor label="Imagens" value={form.images} onChange={images => setForm((p: any) => ({ ...p, images }))} />
                {profile.atracao?.type === "restaurante" && (
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Cardápio</label>
                    <ExperienceListEditor value={form.menu} onChange={menu => setForm((p: any) => ({ ...p, menu }))} />
                  </div>
                )}
              </>
            )}

            {profile.partnerType === "guia" && (
              <>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Breve Histórico / Bio</label>
                  <textarea rows={4} value={form.bio} onChange={e => setForm((p: any) => ({ ...p, bio: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Idiomas Falados</label>
                  <TagInput value={form.languages} onChange={languages => setForm((p: any) => ({ ...p, languages }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Especialidades</label>
                  <TagInput value={form.specialty} onChange={specialty => setForm((p: any) => ({ ...p, specialty }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Temas de Interesse</label>
                  <TagInput value={form.interests} onChange={interests => setForm((p: any) => ({ ...p, interests }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Disponibilidade</label>
                  <select value={form.status} onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-editorial-primary">
                    <option value="disponivel">Disponível</option>
                    <option value="indisponivel">Indisponível</option>
                  </select>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-editorial-border">
              <button
                type="submit" disabled={saving}
                className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-5 py-2.5 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center gap-2"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </button>
              {saved && <span className="text-emerald-700 text-xs font-semibold flex items-center gap-1"><Check className="h-4 w-4" /> Salvo!</span>}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
