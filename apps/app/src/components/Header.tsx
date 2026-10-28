import { AccountWidget } from './AccountWidget';
import { CupMark } from './Logo';

export function Header({ page }: { page: 'home' | 'staff' }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="The Cozy Coffee Table, home">
          <CupMark />
          <span className="brand-name">
            The Cozy <em>Coffee Table</em>
          </span>
        </a>
        <nav className="main-nav" aria-label="Main">
          {page === 'home' ? (
            <>
              <a href="#menu">Menu</a>
              <a href="#special">Today&rsquo;s special</a>
              <a className="nav-cta" href="#book">Book a table</a>
            </>
          ) : (
            <a className="nav-cta" href="#top">Back to the café</a>
          )}
          <AccountWidget />
        </nav>
      </div>
    </header>
  );
}
