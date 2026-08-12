// Maps a language name (as a guide would type it, in Portuguese) to an ISO
// 3166-1 alpha-2 country code — English gets "us" (American flag), not the
// UK, per how this was specifically requested. Keyed by a normalized
// (lowercase, accent-stripped) form so "Português", "portugues" and
// "PORTUGUÊS" all match the same entry.
//
// Rendered as an actual flag IMAGE (via flagcdn.com), not the Unicode flag
// emoji — Windows doesn't compose the regional-indicator character pairs
// into a flag glyph, it just shows the raw two-letter code as text, so the
// emoji approach silently broke for a large chunk of visitors.
const LANGUAGE_COUNTRY: Record<string, string> = {
  portugues: "br",
  ingles: "us",
  espanhol: "es",
  frances: "fr",
  alemao: "de",
  italiano: "it",
  japones: "jp",
  mandarim: "cn",
  chines: "cn",
  coreano: "kr",
  russo: "ru",
  holandes: "nl",
  arabe: "sa",
  hindi: "in",
  hebraico: "il",
  sueco: "se",
  polones: "pl",
  grego: "gr",
  turco: "tr",
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

export function getLanguageFlagUrl(languageName: string): string | null {
  const code = LANGUAGE_COUNTRY[normalize(languageName)];
  return code ? `https://flagcdn.com/${code}.svg` : null;
}
