import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CURRENCIES, formatDate, formatMoney } from './format';
import { categoryDisplayName, translate, type Lang, type MessageKey } from './i18n';

// Language and currency are per browser for now (localStorage). They are not saved to the account yet.
const LANG_KEY = 'neraca.lang';
const CURRENCY_KEY = 'neraca.currency';

interface Prefs {
  lang: Lang;
  setLang: (lang: Lang) => void;
  currency: string;
  setCurrency: (currency: string) => void;
  /** Translated text. `{name}` placeholders are filled from vars. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  money: (amount: number) => string;
  date: (isoDate: string) => string;
  categoryName: (name: string) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private mode). The choice then lasts for this visit only.
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readStored(LANG_KEY) === 'id' ? 'id' : 'en'));
  const [currency, setCurrencyState] = useState<string>(() => {
    const stored = readStored(CURRENCY_KEY);
    return stored && (CURRENCIES as readonly string[]).includes(stored) ? stored : 'IDR';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    writeStored(LANG_KEY, next);
    setLangState(next);
  }, []);

  const setCurrency = useCallback((next: string) => {
    writeStored(CURRENCY_KEY, next);
    setCurrencyState(next);
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      lang,
      setLang,
      currency,
      setCurrency,
      t: (key, vars) => translate(lang, key, vars),
      money: (amount) => formatMoney(amount, currency, lang),
      date: (isoDate) => formatDate(isoDate, lang),
      categoryName: (name) => categoryDisplayName(name, lang),
    }),
    [lang, currency, setLang, setCurrency],
  );

  return <PrefsContext value={value}>{children}</PrefsContext>;
}

export function usePrefs(): Prefs {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs harus dipakai di dalam PrefsProvider');
  return value;
}
