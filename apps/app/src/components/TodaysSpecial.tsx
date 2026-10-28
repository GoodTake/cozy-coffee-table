import { formatPrice, getSpecial } from '../api';
import { releaseRuntimePath } from '../lib/runtime';
import { useApi } from '../useApi';

export function TodaysSpecial() {
  const { data } = useApi(getSpecial);

  return (
    <section className="section section-tinted" id="special">
      <div className="container">
        <article className="special-card">
          <img className="special-image" src={releaseRuntimePath('/api/specials/today.svg')} alt={data ? data.name : "Today's special"} width={600} height={400} />
          <div className="special-copy">
            <p className="eyebrow">Today&rsquo;s special</p>
            <h2>{data ? data.name : 'Fresh from the bar'}</h2>
            <p>{data ? data.description : 'Ask at the counter for what our baristas are making today.'}</p>
            {data && <p className="special-price">{formatPrice(data.price)}</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
