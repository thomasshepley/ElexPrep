import { formatDateTime } from '../utils/format';

/**
 * Drop-in for <input type="datetime-local"> (same "YYYY-MM-DDTHH:mm" string in and out), split
 * into a date and a time field with the chosen value spelt out in en-GB beside it. A single
 * datetime-local renders in US month/day order on some browsers; the readout removes any doubt.
 */
export default function DateTimeInput({
  id,
  value,
  onChange,
  required,
  stepMinutes,
  defaultTime = '09:00',
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  stepMinutes?: number;
  /** Time used when only a date has been picked so far. */
  defaultTime?: string;
}) {
  const [date = '', time = ''] = value ? value.split('T') : [];

  const set = (nextDate: string, nextTime: string) => {
    if (!nextDate) return onChange('');
    onChange(`${nextDate}T${nextTime || defaultTime}`);
  };

  return (
    <div className="datetime-input">
      <input
        id={id}
        type="date"
        lang="en-GB"
        value={date}
        required={required}
        aria-label={id ? undefined : 'Date'}
        onChange={(e) => set(e.target.value, time)}
      />
      <input
        type="time"
        lang="en-GB"
        value={time}
        required={required}
        aria-label="Time (24-hour)"
        step={stepMinutes ? stepMinutes * 60 : undefined}
        disabled={!date}
        onChange={(e) => set(date, e.target.value)}
      />
      {value && <span className="muted datetime-input-readout">{formatDateTime(value, { withYear: true })}</span>}
    </div>
  );
}
