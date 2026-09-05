import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useT } from '../state/PrefsProvider';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

export function Button({ variant = 'secondary', className, ...rest }: ButtonProps) {
  const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
    // 600, not the identity 500: white on #20A44C is 3.06:1, under AA.
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
    secondary:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  };
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        styles[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400',
        'focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
        className,
      )}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900',
        'focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{children}</span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500 dark:text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {t(label)}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}

/** Small inline modal used for edit forms and destructive confirmations. */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cx(
          'my-8 w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label={t('Close')}>
            ✕
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * A password input with an eye toggle inside the field. Used on the sign-in
 * screen and in Account, so the behaviour is identical in both places.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  reveal,
  onToggleReveal,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  reveal: boolean;
  onToggleReveal: () => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type={reveal ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        // Room for the button, so a long password never runs under the icon.
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggleReveal}
        aria-label={reveal ? 'Hide password' : 'Show password'}
        aria-pressed={reveal}
        title={reveal ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
      >
        {reveal ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.1-.9" />
    </svg>
  );
}

/** Small status chip: pen category, meal, sync state, out-of-spec flags. */
/**
 * An on/off switch. Flips on click — there is no separate confirm button, so
 * `onChange` writes immediately and `busy` holds it while the write is in
 * flight. The track keeps its colour while busy rather than greying out: the
 * setting has not reverted, it is just still saving.
 */
export function Switch({
  checked,
  onChange,
  busy,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  busy?: boolean;
  /** Screen-reader name — the visible text sits beside the switch, not in it. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none',
        'dark:focus-visible:ring-offset-slate-900',
        busy ? 'cursor-wait opacity-70' : 'cursor-pointer',
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand';
}) {
  const tones = {
    neutral: 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300',
    good: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    warn: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    bad: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    brand: 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * The load bar, ported from the app's `loadBarState()` — and it has to keep
 * the same geometry, or the manager and the operator are reading two
 * different pictures of the same load.
 *
 * Fill and percentage come apart on purpose: 100% of target sits at 75% of the
 * bar, the last quarter is the tolerance band, and past the band the bar pins
 * full while only the number keeps climbing. Under target is amber, inside the
 * band is green, over it is red.
 */
const BAR_TARGET_FILL = 75;

export function LoadBar({
  actualKg,
  targetKg,
  tolPct = 120,
}: {
  actualKg: number | null;
  targetKg: number;
  tolPct?: number;
}) {
  const t = useT();
  if (!targetKg || actualKg == null) {
    return <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800" />;
  }
  // A band ending at or below 100 would divide by zero; treat it as a hairline
  // so "on target" stays reachable rather than instantly red.
  const span = Math.max(0.5, tolPct - 100);
  const pct = (actualKg / targetKg) * 100;

  let fill: number;
  let colour: string;
  if (pct < 100) {
    fill = (pct / 100) * BAR_TARGET_FILL;
    colour = 'bg-amber-500';
  } else if (pct <= tolPct) {
    fill = BAR_TARGET_FILL + ((pct - 100) / span) * (100 - BAR_TARGET_FILL);
    colour = 'bg-brand-500';
  } else {
    fill = 100;
    colour = 'bg-red-500';
  }

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      title={t('{v1}% de {v2} kg · tolerancia {v3}%', { v1: pct.toFixed(1), v2: Math.round(targetKg), v3: tolPct })}
    >
      <div
        className={cx('h-full rounded-full transition-[width]', colour)}
        style={{ width: `${Math.max(0, Math.min(100, fill))}%` }}
      />
      {/* The tick marks where 100% of target lands. */}
      <span
        className="absolute inset-y-0 w-px bg-slate-500/60 dark:bg-slate-300/50"
        style={{ left: `${BAR_TARGET_FILL}%` }}
      />
    </div>
  );
}

/** Scrollable table shell. Wide tables scroll inside the card, never the page. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={cx(
        'sticky top-0 z-10 bg-slate-50 px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-600 dark:bg-slate-900 dark:text-slate-300',
        right ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cx(
        'px-3 py-2 text-sm whitespace-nowrap text-slate-700 dark:text-slate-200',
        right && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}
