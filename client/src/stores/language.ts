import { create } from 'zustand';
import { translations, type Language, type TranslationKeys } from '../i18n/translations';

interface LanguageState {
  current: Language;
  t: TranslationKeys;
  setLanguage: (lang: Language) => void;
  tPath: (path: string, params?: Record<string, string | number>) => string;
}

const getNestedValue = (obj: any, path: string): string => {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) || path;
};

const interpolate = (str: string, params?: Record<string, string | number>): string => {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  current: 'zh-CN',
  t: translations['zh-CN'],

  setLanguage: (lang: Language) => {
    set({
      current: lang,
      t: translations[lang]
    });
  },

  tPath: (path: string, params?: Record<string, string | number>) => {
    const { t } = get();
    const value = getNestedValue(t, path);
    return interpolate(value, params);
  }
}));
