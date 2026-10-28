import { CupMark } from './Logo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="footer-brand">
            <CupMark size={30} />
            <span>The Cozy Coffee Table</span>
          </div>
          <p>Small-batch coffee and an oven that never really cools down.</p>
        </div>
        <div>
          <h4>Find us</h4>
          <p>14 Linden Row<br />Bristol BS6 5AA</p>
        </div>
        <div>
          <h4>Opening hours</h4>
          <p>Mon&ndash;Fri 7:30&ndash;18:00<br />Sat&ndash;Sun 8:30&ndash;17:00</p>
        </div>
        <div>
          <h4>Team</h4>
          <p><a href="#/staff">Staff bookings</a></p>
        </div>
      </div>
      <p className="container footer-small">&copy; {new Date().getFullYear()} The Cozy Coffee Table. Made with oat milk and love.</p>
    </footer>
  );
}
