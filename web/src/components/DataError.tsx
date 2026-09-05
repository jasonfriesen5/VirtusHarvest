import { useData } from '../state/DataProvider';
import { useT } from '../state/PrefsProvider';
import { Button, Card } from './ui';

/**
 * A failed load must never be a dead end. The first version of this screen was
 * a red banner and nothing else — no retry, no explanation — so a transient
 * server-side hiccup looked exactly like a broken console.
 *
 * The JWT case is called out by name because it is the one that reads as
 * alarming and is almost never the user's fault: Supabase mints the token on
 * one node and validates it on another, and while those two clocks are a
 * second apart the token looks issued-in-the-future. It clears itself.
 */
export function DataError({ message }: { message: string }) {
  const t = useT();
  const { refresh, loading } = useData();

  const jwt = /jwt|token|issued at future|exp|expired/i.test(message);

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {jwt ? t('La sesión no fue aceptada por el servidor') : t('No se pudieron cargar los datos')}
      </h2>

      {jwt ? (
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          El servidor rechazó el token de la sesión, casi siempre por un desfase de segundos entre el reloj que
          firma el token y el que lo valida. Se corrige solo: reintente en unos segundos. Si sigue, cierre sesión y
          vuelva a ingresar.
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          La consola no pudo leer los datos de la cuenta. Puede ser la conexión o un problema momentáneo del
          servidor.
        </p>
      )}

      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        {message}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Reintentando…' : 'Reintentar'}
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t('La consola también reintenta sola cada pocos segundos.')}
        </span>
      </div>
    </Card>
  );
}
