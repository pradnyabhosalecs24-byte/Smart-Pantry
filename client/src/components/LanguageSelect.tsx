import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { currentLang, LANGUAGES, onLangChange, savedLang, setLang, type Lang } from "../lib/i18n";

/** The current interface language; re-renders when it changes. For text React must build itself (e.g. split into words). */
export function useLang(): Lang {
  const [lang, setL] = useState<Lang>(currentLang);
  useEffect(() => onLangChange(setL), []);
  return lang;
}

/** English / हिन्दी / ಕನ್ನಡ. Each option is written in its own script so people can find their language. */
export function LanguageSelect({ className = "inline-flex" }: { className?: string }) {
  const [lang, setL] = useState<Lang>(() => (currentLang() === "en" ? savedLang() : currentLang()));
  useEffect(() => onLangChange(setL), []);
  return (
    <label className={`relative items-center ${className}`} translate="no">
      <span className="sr-only">Language / भाषा / ಭಾಷೆ</span>
      <Languages className="pointer-events-none absolute left-2 size-4 text-ink-2" aria-hidden />
      <select
        value={lang}
        onChange={(e) => void setLang(e.target.value as Lang)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-surface py-1 pr-2 pl-7 text-sm font-medium text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-basil"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value} lang={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
