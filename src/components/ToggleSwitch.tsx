import React from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelOn?: string;
  labelOff?: string;
}

// A real on/off switch instead of a <select> dropdown — used for a guide's
// live availability, which the partner is meant to flip themselves each
// time they log in, not fill out as a fixed schedule at application time.
export default function ToggleSwitch({ checked, onChange, labelOn = "Disponível", labelOff = "Indisponível" }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 cursor-pointer"
    >
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-emerald-600" : "bg-zinc-300"
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
      <span className={`text-xs font-semibold ${checked ? "text-emerald-700" : "text-zinc-500"}`}>
        {checked ? labelOn : labelOff}
      </span>
    </button>
  );
}
