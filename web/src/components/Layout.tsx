import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import type { AreaUnit, DisplayUnit } from '../lib/units';
import { Button, cx } from './ui';
import RemisionRetryRunner from './RemisionRetryRunner';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/records', label: 'Records', end: false },
  { to: '/truckloads', label: 'Remisión', end: false },
  { to: '/live', label: 'Today', end: false },
  { to: '/map', label: 'Map', end: false },
  { to: '/manage', label: 'Manage', end: false },
  { to: '/account', label: 'Account', end: false },
];

const UNITS: DisplayUnit[] = ['kg', 'lb', 't'];
const AREA_UNITS: AreaUnit[] = ['ha', 'ac'];

function LiveBadge() {
  const { liveStatus } = useData();
  const config = {
    live: { dot: 'bg-emerald-500', text: 'Live', title: 'Receiving updates over Supabase Realtime' },
    polling: {
      dot: 'bg-amber-500',
      text: 'Polling',
      title: 'Realtime is unavailable — refreshing every 30 seconds instead',
    },
    connecting: { dot: 'bg-slate-400', text: 'Connecting', title: 'Opening the realtime channel' },
  }[liveStatus];

  return (
    <span
      title={config.title}
      className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 sm:inline-flex dark:border-slate-700 dark:text-slate-300"
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.text}
    </span>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { seasons } = useData();
  const { unit, setUnit, areaUnit, setAreaUnit, seasonId, setSeasonId, theme, toggleTheme } = usePrefs();

  return (
    <div className="flex min-h-full flex-col">
      <RemisionRetryRunner />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* The full artwork includes the "HARVEST" wordmark, which turns to
                mush at 28px. Zooming to the V-and-wheat mark crops the wordmark
                out — the adjacent text already says the name. */}
            <span className="block h-7 w-7 shrink-0 overflow-hidden rounded-md ring-1 ring-black/5 dark:ring-white/10">
              <img
                src="/virtus-icon.png"
                alt=""
                className="h-full w-full scale-[1.55] object-cover"
                style={{ objectPosition: '50% 38%' }}
              />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Virtus Harvest
            </span>
          </div>

          <LiveBadge />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              aria-label="Season"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Weight unit"
              className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {UNITS.map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  aria-pressed={unit === u}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    unit === u
                      ? 'bg-gold-500 text-ink'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Area unit"
              className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {AREA_UNITS.map((u) => (
                <button
                  key={u}
                  onClick={() => setAreaUnit(u)}
                  aria-pressed={areaUnit === u}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    areaUnit === u
                      ? 'bg-gold-500 text-ink'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>

            <Button variant="ghost" onClick={toggleTheme} aria-label="Toggle dark mode" className="px-2">
              {theme === 'dark' ? '☀' : '☾'}
            </Button>

            <span className="hidden max-w-40 truncate text-xs text-slate-500 lg:inline dark:text-slate-400">
              {user?.email}
            </span>
            <Button onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Virtus Harvest — records sync from the mobile app.
      </footer>
    </div>
  );
}
