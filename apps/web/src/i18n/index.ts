import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ur from './ur.json';

export type Language = 'en' | 'ur';
export const RTL_LANGUAGES: Language[] = ['ur'];
const STORAGE_KEY = 'nexora.lang';

export const getDirection = (lang: string): 'ltr' | 'rtl' =>
  RTL_LANGUAGES.includes(lang as Language) ? 'rtl' : 'ltr';

function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

function applyDocumentLanguage(lang: string): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = getDirection(lang);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
  lng: readStoredLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', (lang) => {
  applyDocumentLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: language still applies for this session */
  }
});

export default i18n;
