import { useEffect, useState, type ReactNode } from 'react';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { resolveWalletLocale } from '@/lib/walletLocale';

function readSiteLanguage(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.lang;
}

export default function SiteRainbowKitProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(() => resolveWalletLocale(readSiteLanguage()));

  useEffect(() => {
    const root = document.documentElement;
    const syncLocale = () => setLocale(resolveWalletLocale(root.lang));
    const observer = new MutationObserver(syncLocale);

    syncLocale();
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);

  return <RainbowKitProvider locale={locale}>{children}</RainbowKitProvider>;
}
