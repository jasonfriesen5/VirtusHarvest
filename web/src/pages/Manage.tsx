import { useState } from 'react';
import { useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { Card, Spinner, cx } from '../components/ui';
import { DataError } from '../components/DataError';
import LotsTab from './manage/LotsTab';
import GroupsTab from './manage/GroupsTab';
import RationsTab from './manage/RationsTab';
import IngredientsTab from './manage/IngredientsTab';
import CyclesTab from './manage/CyclesTab';
import TeamTab from './manage/TeamTab';

const TABS = [
  { key: 'lots', label: 'Corrales' },
  { key: 'groups', label: 'Grupos' },
  { key: 'rations', label: 'Raciones' },
  { key: 'ingredients', label: 'Insumos' },
  { key: 'cycles', label: 'Ciclos' },
  { key: 'team', label: 'Mixers y operadores' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Where the setup gets built and maintained. The console is the comfortable
 * place to do it — a keyboard, a big screen — while the tablet stays the place
 * where feed actually gets weighed.
 *
 * Writes land straight in Supabase, and the app's pull is "cloud wins, except
 * rows this device changed and hasn't uploaded", so a change made here reaches
 * every tablet on its next sync, deletions included.
 */
export default function Manage() {
  const t = useT();
  const { loading, error, cycles } = useData();
  const { cycleId } = usePrefs();
  const [tab, setTab] = useState<TabKey>('lots');

  if (loading) return <Spinner label={t('Cargando la configuración…')} />;
  if (error) return <DataError message={error} />;

  const cycleName = cycles.find((c) => c.id === cycleId)?.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={cx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === item.key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {cycleName
            ? t('Corrales y grupos filtrados por el ciclo {v1}.', { v1: cycleName })
            : t('Mostrando todos los ciclos.')}{' '}
          {t('Los cambios llegan a las tablets en su próxima sincronización.')}
        </p>
      </div>

      {tab === 'lots' && <LotsTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'rations' && <RationsTab />}
      {tab === 'ingredients' && <IngredientsTab />}
      {tab === 'cycles' && <CyclesTab />}
      {tab === 'team' && <TeamTab />}

      {cycles.length === 0 && (
        <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
          {t('Todavía no hay ningún ciclo. Cree uno en la pestaña')} <b>{t('Ciclos')}</b> antes de cargar corrales: casi todo se
          consulta por ciclo, y los corrales sin ciclo no aparecen cuando se filtra.
        </Card>
      )}
    </div>
  );
}
