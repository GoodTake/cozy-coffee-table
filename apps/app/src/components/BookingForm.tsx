import { useState, type FormEvent } from 'react';
import { createBooking, type BookingResult } from '../api';

const TIMES = Array.from({ length: 19 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const today = () => new Date().toLocaleDateString('en-CA');

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function BookingForm() {
  const [status, setStatus] = useState<'idle' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setError(null);
    try {
      const booked = await createBooking({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        date: String(form.get('date') ?? ''),
        time: String(form.get('time') ?? ''),
        partySize: Number(form.get('partySize')),
      });
      setResult(booked);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus('idle');
    }
  }

  return (
    <section className="section" id="book">
      <div className="container book-grid">
        <div className="book-intro">
          <p className="eyebrow">Book a table</p>
          <h2>Save yourself a seat</h2>
          <p>
            Tables for one to eight, every half hour from 8am to 5pm. Walk-ins are always welcome too, but the window
            seats go quickly at the weekend.
          </p>
          <ul className="hours">
            <li><span>Monday to Friday</span><span>7:30 &ndash; 18:00</span></li>
            <li><span>Saturday and Sunday</span><span>8:30 &ndash; 17:00</span></li>
          </ul>
        </div>

        <div className="book-panel">
          {result ? (
            <div className="confirmation" role="status">
              <div className="confirmation-badge" aria-hidden="true">&#10003;</div>
              <h3>You&rsquo;re booked in</h3>
              <p>{result.message}</p>
              <dl className="confirmation-details">
                <div><dt>When</dt><dd>{formatDate(result.booking.date)}, {result.booking.time}</dd></div>
                <div><dt>Guests</dt><dd>{result.booking.partySize}</dd></div>
                <div><dt>Reference</dt><dd>{result.booking.id.slice(0, 8).toUpperCase()}</dd></div>
              </dl>
              <button className="button button-ghost" type="button" onClick={() => setResult(null)}>
                Book another table
              </button>
            </div>
          ) : (
            <form className="booking-form" onSubmit={onSubmit}>
              <label className="field field-wide">
                <span>Your name</span>
                <input name="name" autoComplete="name" required maxLength={80} placeholder="Alex Morgan" />
              </label>
              <label className="field field-wide">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required placeholder="alex@example.com" />
              </label>
              <label className="field">
                <span>Date</span>
                <input name="date" type="date" required min={today()} defaultValue={today()} />
              </label>
              <label className="field">
                <span>Time</span>
                <select name="time" required defaultValue="10:00">
                  {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field field-wide">
                <span>Party size</span>
                <select name="partySize" required defaultValue="2">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? '1 guest' : `${n} guests`}</option>
                  ))}
                </select>
              </label>
              {error && <p className="error-text field-wide" role="alert">{error}</p>}
              <button className="button field-wide" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Booking your table…' : 'Book my table'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
