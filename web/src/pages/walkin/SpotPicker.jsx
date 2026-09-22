import { thDateShort, weekday } from '../../format';

export function DatePicker({ dates, value, onChange }) {
  return (
    <div className="dates" role="radiogroup" aria-label="วันที่">
      {dates.map(d => (
        <button type="button" key={d} role="radio" aria-checked={value === d} className={`date-chip ${value === d ? 'on' : ''}`} onClick={() => onChange(d)}>
          <small>{weekday(d)}</small>{thDateShort(d)}
        </button>
      ))}
    </div>
  );
}

export function SpotGrid({ spots, value, onPick, showNames }) {
  return (
    <div className="spots">
      {spots.map(s => (
        <button type="button" key={s.spot} disabled={s.taken && !showNames} onClick={() => !s.taken && onPick(s.spot)}
          className={`spot ${s.taken ? 'taken' : ''} ${value === s.spot ? 'on' : ''}`} aria-pressed={value === s.spot}>
          <span className={`plate ${s.taken ? 'off' : ''}`}>{s.spot}</span>
          {s.taken
            ? <small>{showNames ? <>{s.full_name}<br />{s.product} · {s.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}</> : 'จองแล้ว'}</small>
            : <small>ว่าง</small>}
        </button>
      ))}
    </div>
  );
}
