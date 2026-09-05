import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs, WINDOWS, useT } from '../state/PrefsProvider';
import type { WeightUnit } from '../lib/format';
import { Button, cx } from './ui';

const NAV = [
  { to: '/', label: 'Panel', end: true },
  { to: '/deliveries', label: 'Descargas', end: false },
  { to: '/feedings', label: 'Mezclas', end: false },
  { to: '/pens', label: 'Corrales', end: false },
  { to: '/inventory', label: 'Insumos', end: false },
  { to: '/today', label: 'Hoy', end: false },
  { to: '/operators', label: 'Operarios', end: false },
  { to: '/manage', label: 'Gestión', end: false },
  { to: '/account', label: 'Cuenta', end: false },
];

const UNITS: WeightUnit[] = ['kg', 't', 'lb'];

function LiveBadge() {
  const t = useT();
  const { liveStatus } = useData();
  const config = {
    live: { dot: 'bg-emerald-500', text: 'En vivo', title: 'Recibiendo cambios por Supabase Realtime' },
    polling: {
      dot: 'bg-amber-500',
      text: 'Consultando',
      title: 'Realtime no está disponible — actualizando cada 30 segundos',
    },
    connecting: { dot: 'bg-slate-400', text: 'Conectando', title: 'Abriendo el canal en vivo' },
  }[liveStatus];

  return (
    <span
      title={t(config.title)}
      className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 sm:inline-flex dark:border-slate-700 dark:text-slate-300"
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', config.dot)} />
      {t(config.text)}
    </span>
  );
}

export default function Layout() {
  const t = useT();
  const { user, signOut } = useAuth();
  const { cycles } = useData();
  const { lang, setLang, unit, setUnit, cycleId, setCycleId, windowDays, setWindowDays, theme, toggleTheme } =
    usePrefs();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-extrabold tracking-[0.14em] text-slate-900 dark:text-slate-50">
              {'VIRTUS'}
            </span>
            <span className="text-xs font-semibold tracking-[0.28em] text-brand-500">{'FEED'}</span>
          </div>

          <LiveBadge />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              aria-label={'Ciclo'}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">{t('Todos los ciclos')}</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Every per-day figure on the site — intake, cost/head, runway —
                averages over this window, so it belongs in the chrome next to
                the cycle rather than inside one page. */}
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value) as (typeof WINDOWS)[number])}
              aria-label={'Ventana de promedio'}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  {t('{v1} días', { v1: d })}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label={'Unidad de peso'}
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
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Language names stay in their own language — a reader looking
                for "English" should not have to find it under "Inglés". */}
            <div
              role="group"
              aria-label={'Idioma'}
              className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  title={l === 'es' ? 'Español' : 'English'}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium uppercase transition-colors',
                    lang === l
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <Button variant="ghost" onClick={toggleTheme} aria-label={'Modo oscuro'} className="px-2">
              {theme === 'dark' ? '☀' : '☾'}
            </Button>

            <span className="hidden max-w-40 truncate text-xs text-slate-500 lg:inline dark:text-slate-400">
              {user?.email}
            </span>
            <Button onClick={() => void signOut()}>{t('Salir')}</Button>
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
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {'Virtus Feed — los registros llegan desde la app del mixer.'}
      </footer>
    </div>
  );
}
