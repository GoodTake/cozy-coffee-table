import { useState } from 'react';
import { downloadBookingsCsv, getTodaysBookings } from '../api';
import { useApi } from '../useApi';

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function StaffPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useApi(getTodaysBookings, [refresh]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const guests = data?.bookings.reduce((sum, b) => sum + b.partySize, 0) ?? 0;

  async function onDownload() {
    setDownloadError(null);
    try {
      await downloadBookingsCsv();
    } catch (err) {
      setDownloadError((err as Error).message);
    }
  }

  return (
    <section className="section staff">
      <div className="container">
        <div className="staff-head">
          <div>
            <p className="eyebrow">Staff</p>
            <h1>Today&rsquo;s bookings</h1>
            {data && <p className="muted">{formatDate(data.date)}</p>}
          </div>
          <div className="staff-actions">
            <button className="button button-ghost" type="button" onClick={() => setRefresh((n) => n + 1)}>
              Refresh
            </button>
            <button className="button" type="button" onClick={onDownload}>
              Download CSV
            </button>
          </div>
        </div>

        {downloadError && <p className="error-text" role="alert">{downloadError}</p>}

        {data && (
          <div className="staff-stats">
            <div><strong>{data.bookings.length}</strong><span>bookings</span></div>
            <div><strong>{guests}</strong><span>guests expected</span></div>
          </div>
        )}

        <div className="staff-table-wrap">
          {loading && <p className="muted pad">Loading bookings&hellip;</p>}
          {error && <p className="error-text pad">We couldn&rsquo;t load today&rsquo;s bookings. {error}</p>}
          {data && data.bookings.length === 0 && <p className="muted pad">No bookings yet today. Time for a coffee.</p>}
          {data && data.bookings.length > 0 && (
            <table className="staff-table">
              <thead>
                <tr><th scope="col">Time</th><th scope="col">Name</th><th scope="col">Party</th></tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="staff-time">{b.time}</td>
                    <td>{b.name}</td>
                    <td>{b.partySize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
