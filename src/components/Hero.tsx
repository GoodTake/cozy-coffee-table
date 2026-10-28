import { BaristaNote } from './BaristaNote';
import { CoffeeArt } from './CoffeeArt';

export function Hero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Neighbourhood café &middot; 14 Linden Row</p>
          <h1>
            Slow coffee, warm pastries and a table <em>with your name on it.</em>
          </h1>
          <p className="lede">
            The Cozy Coffee Table has been pouring coffee on Linden Row since 2016. We roast in small batches, bake
            everything in our own kitchen each morning, and keep the good armchairs for whoever gets here first.
          </p>
          <div className="hero-actions">
            <a className="button" href="#book">Book a table</a>
            <a className="button button-ghost" href="#menu">See the menu</a>
          </div>
          <BaristaNote />
        </div>
        <CoffeeArt />
      </div>
    </section>
  );
}
