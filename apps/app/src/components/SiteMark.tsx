import { useState } from 'react';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site-identity';

interface Props {
  /** 'full' shows the logo and the name; 'logo' and 'name' show one of them. */
  variant?: 'full' | 'logo' | 'name';
  className?: string;
  logoClassName?: string;
  nameClassName?: string;
}

/**
 * The site's brand mark. Every place the site shows its own logo or name must
 * render this, so the owner's Console edits reach all of them at once.
 */
export function SiteMark({
  variant = 'full',
  className,
  logoClassName,
  nameClassName,
}: Props) {
  // The logo file is written and removed from the Console, so its absence is a
  // normal state rather than an error — and asking the image is the only check
  // that cannot drift from the file itself.
  const [logoFailed, setLogoFailed] = useState(false);
  const name = SITE_NAME || (typeof document === 'undefined' ? '' : document.title);
  const showLogo = variant !== 'name' && !logoFailed;
  // A logo-only mark still has to say something when there is no logo.
  const showName = variant !== 'logo' || logoFailed;

  return (
    <span className={className}>
      {showLogo && (
        <img
          src={SITE_LOGO_URL}
          alt={showName ? '' : name}
          onError={() => setLogoFailed(true)}
          className={logoClassName}
        />
      )}
      {showName && <span className={nameClassName}>{name}</span>}
    </span>
  );
}

export default SiteMark;
