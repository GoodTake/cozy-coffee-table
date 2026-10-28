import type { Locale } from '@rainbow-me/rainbowkit';

const SUPPORTED_LOCALES = new Set<Locale>([
  'ar',
  'ar-AR',
  'de',
  'de-DE',
  'en',
  'en-US',
  'es',
  'es-419',
  'fr',
  'fr-FR',
  'hi',
  'hi-IN',
  'id',
  'id-ID',
  'ja',
  'ja-JP',
  'ko',
  'ko-KR',
  'ms',
  'ms-MY',
  'pt',
  'pt-BR',
  'ru',
  'ru-RU',
  'th',
  'th-TH',
  'tr',
  'tr-TR',
  'ua',
  'uk-UA',
  'vi',
  'vi-VN',
  'zh',
  'zh-CN',
  'zh-HK',
  'zh-TW',
  'zh-Hans',
  'zh-Hant',
]);

export function resolveWalletLocale(language: string | null | undefined): Locale {
  const raw = language?.trim().replaceAll('_', '-');
  if (!raw) return 'en-US';

  let canonical: string;
  try {
    [canonical] = Intl.getCanonicalLocales(raw);
  } catch {
    return 'en-US';
  }

  if (SUPPORTED_LOCALES.has(canonical as Locale)) {
    return canonical as Locale;
  }

  const parsed = new Intl.Locale(canonical);
  const baseLanguage = parsed.language;

  if (baseLanguage === 'zh') {
    if (parsed.script === 'Hant') return 'zh-Hant';
    if (parsed.script === 'Hans') return 'zh-Hans';
    if (parsed.region === 'HK') return 'zh-HK';
    if (parsed.region === 'TW') return 'zh-TW';
    if (parsed.region === 'MO') return 'zh-Hant';
    if (parsed.region === 'CN') return 'zh-CN';
    if (parsed.region === 'SG') return 'zh-Hans';
  }

  if (baseLanguage === 'uk') return 'uk-UA';
  if (SUPPORTED_LOCALES.has(baseLanguage as Locale)) {
    return baseLanguage as Locale;
  }

  return 'en-US';
}
