// Maps a language name (as a guide would type it, in Portuguese) to the
// flag emoji shown under their profile photo — English gets the US flag,
// not the UK one, per how this was specifically requested. Keyed by a
// normalized (lowercase, accent-stripped) form so "Português", "portugues"
// and "PORTUGUÊS" all match the same entry.
const LANGUAGE_FLAGS: Record<string, string> = {
  portugues: "🇧🇷",
  ingles: "🇺🇸",
  espanhol: "🇪🇸",
  frances: "🇫🇷",
  alemao: "🇩🇪",
  italiano: "🇮🇹",
  japones: "🇯🇵",
  mandarim: "🇨🇳",
  chines: "🇨🇳",
  coreano: "🇰🇷",
  russo: "🇷🇺",
  holandes: "🇳🇱",
  arabe: "🇸🇦",
  hindi: "🇮🇳",
  hebraico: "🇮🇱",
  sueco: "🇸🇪",
  polones: "🇵🇱",
  grego: "🇬🇷",
  turco: "🇹🇷",
  libras: "🤟",
};

// Strips combining diacritical marks (U+0300-U+036F) after NFD
// normalization — e.g. "português" -> "portugues". Filtered by char code
// instead of a regex literal to sidestep any source-encoding ambiguity with
// the marks themselves.
function normalize(name: string): string {
  const decomposed = name.trim().toLowerCase().normalize("NFD");
  let result = "";
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) || 0;
    if (code < 0x0300 || code > 0x036f) result += ch;
  }
  return result;
}

export function getLanguageFlag(languageName: string): string | null {
  return LANGUAGE_FLAGS[normalize(languageName)] || null;
}
