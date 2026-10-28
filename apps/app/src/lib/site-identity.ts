// The site's own identity. You write it when you first name the site and when
// the user asks for a different name. It is the single source — never
// hard-code the site name anywhere else.
//
// Empty means "not set": SiteMark falls back to the document title, which is
// the name the site already shows in the browser tab.
export const SITE_NAME = '';

/** Fixed path. The file may not exist yet; it is generated when the user asks for a logo. */
export const SITE_LOGO_URL = '/site-logo.png';
