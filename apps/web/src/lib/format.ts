import i18n from '@/i18n';

/**
 * Language-aware helpers for things that were being formatted with the
 * browser's own locale (so an Urdu screen could show English-style
 * numbers or an arrow pointing the wrong way).
 */
const localeOf = (lang: string): string => (lang === 'ur' ? 'ur-PK' : 'en-GB');

export const fmtNumber = (n: number, lang: string = i18n.language): string => n.toLocaleString(localeOf(lang));

/** "from → to": in right-to-left text the arrow has to point left. */
export const rangeArrow = (lang: string = i18n.language): string => (lang === 'ur' ? '←' : '→');
