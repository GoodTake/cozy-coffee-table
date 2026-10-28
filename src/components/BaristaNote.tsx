import { getNote } from '../api';
import { useApi } from '../useApi';

export function BaristaNote() {
  const { data, error, loading } = useApi(getNote);

  return (
    <aside className="note-card" aria-live="polite">
      <p className="eyebrow">Barista&rsquo;s note of the day</p>
      {loading && <p className="note-text muted">Brewing today&rsquo;s note&hellip;</p>}
      {error && <p className="note-text muted">Our barista is busy with the milk steamer. Check back soon.</p>}
      {data && (
        <>
          <p className="note-text">&ldquo;{data.note}&rdquo;</p>
          <p className="note-signature">&mdash; {data.barista}</p>
        </>
      )}
    </aside>
  );
}
