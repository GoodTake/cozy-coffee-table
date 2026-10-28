import { formatPrice, getMenu, type MenuItem } from '../api';
import { useApi } from '../useApi';

function MenuColumn({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div className="menu-column">
      <h3>{title}</h3>
      <ul className="menu-list">
        {items.map((item) => (
          <li key={item.id}>
            <div className="menu-row">
              <span className="menu-name">{item.name}</span>
              <span className="menu-leader" aria-hidden="true" />
              <span className="menu-price">{formatPrice(item.price)}</span>
            </div>
            <p className="menu-desc">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Menu() {
  const { data, error, loading } = useApi(getMenu);

  return (
    <section className="section" id="menu">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">The menu</p>
          <h2>Something to sip, something to share</h2>
        </div>
        {loading && <p className="muted">Setting out the menu&hellip;</p>}
        {error && <p className="error-text">We couldn&rsquo;t load the menu just now. Please refresh the page.</p>}
        {data && (
          <div className="menu-grid">
            <MenuColumn title="Drinks" items={data.drinks} />
            <MenuColumn title="Pastries" items={data.pastries} />
          </div>
        )}
      </div>
    </section>
  );
}
