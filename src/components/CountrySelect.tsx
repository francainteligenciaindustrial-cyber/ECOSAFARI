import React, { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { countryOptions, normalizeCountry } from "../lib/countries";

const OTHER = "__outro__";

interface Props {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

// Seletor de país: os mais comuns no topo, depois todos em ordem alfabética,
// e "Outro" para digitar à mão (valor antigo fora da lista também cai aqui).
export default function CountrySelect({ value, onChange, required, className, placeholder = "País", id }: Props) {
  const { locale, lang } = useI18n();
  const { common, all } = useMemo(() => countryOptions(locale), [locale]);
  const normalized = normalizeCountry(value);
  const known = useMemo(() => new Set([...common, ...all].map(o => o.value)), [common, all]);
  const [typing, setTyping] = useState(false);
  const isOther = typing || (normalized !== "" && !known.has(normalized));
  const otherLabel = lang === "en" ? "Other (type it)" : lang === "es" ? "Otro (escribir)" : "Outro (digitar)";
  const commonLabel = lang === "en" ? "Most common" : lang === "es" ? "Más comunes" : "Mais comuns";
  const allLabel = lang === "en" ? "All countries" : lang === "es" ? "Todos los países" : "Todos os países";

  return (
    <div className="w-full space-y-2">
      <select
        id={id}
        aria-label={placeholder}
        required={required && !isOther}
        value={isOther ? OTHER : normalized}
        onChange={e => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange("");
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="" disabled>{placeholder}</option>
        <optgroup label={commonLabel}>
          {common.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
        <optgroup label={allLabel}>
          {all.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {isOther && (
        <input
          type="text"
          required={required}
          autoFocus={typing}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={className}
        />
      )}
    </div>
  );
}
