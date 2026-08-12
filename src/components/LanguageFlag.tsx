import React from "react";
import { Globe } from "lucide-react";
import { getLanguageFlagUrl } from "../lib/languageFlags";

interface LanguageFlagProps {
  language: string;
  className?: string;
}

// Renders an actual flag image (via flagcdn.com) instead of the Unicode
// flag emoji — see languageFlags.ts for why. Falls back to a plain globe
// icon (not another emoji) for a language with no mapped country.
export default function LanguageFlag({ language, className = "w-5 h-3.5" }: LanguageFlagProps) {
  const url = getLanguageFlagUrl(language);
  if (!url) return <Globe className={`${className} text-editorial-muted flex-shrink-0`} aria-label={language} />;
  return (
    <img
      src={url}
      alt={language}
      title={language}
      referrerPolicy="no-referrer"
      className={`${className} object-cover rounded-[2px] border border-black/10 inline-block flex-shrink-0`}
    />
  );
}
