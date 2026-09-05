import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { deliveryDetail } from '../lib/analytics';
import type { DeliveryDetail } from '../lib/analytics';
import {
  downloadCsv,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatWeight,
  toCsv,
} from '../lib/format';
import { DataError } from '../components/DataError';
import { FilterPanel } from '../components/FilterPanel';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  cx,
} from '../components/ui';

type SortKey = 'at' | 'lot' | 'kg' | 'kgPerHead' | 'costPerHead';

/**
 * Every unload, one row each — the transaction list the app's Descargas tab
 * shows on a phone, with the filters and the export a desk needs. Per-head
 * figures come from `deliveryDetail()`, the same call the app uses.
 */
export default function Deliveries() {
  const t = useT();
  const { ix, loading, error } = useData();
  const { unit } = usePrefs();
  const currency = useCurrency();

  const [query, setQuery] = useState('');
  const [meal, setMeal] = useState('');
  const [operator, setOperator] = useState('');
  const [ration, setRation] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<SortKey>('at');
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const out: DeliveryDetail[] = [];
    ix.t.deliveries.forEach((d) => {
      const detail = deliveryDetail(ix, d);
      if (detail) out.push(detail);
    });
    return out;
  }, [ix]);

  const meals = useMemo(
    () => Array.from(new Set(rows.map((r) => r.meal).filter(Boolean))) as string[],
    [rows],
  );
  const operators = useMemo(
    () => Array.from(new Set(rows.map((r) => r.operator).filter(Boolean))) as string[],
    [rows],
  );
  const rations = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ration).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Date inputs are day-granular; the "to" bound has to cover the whole day
    // or the last feeding of it silently disappears from the table.
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    const list = rows.filter((r) => {
      if (meal && r.meal !== meal) return false;
      if (operator && r.operator !== operator) return false;
      if (ration && r.ration !== ration) return false;
      if (fromTs || toTs) {
        const t = r.at ? new Date(r.at).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (q) {
        const hay = `${r.lotName ?? ''} ${r.groupName ?? ''} ${r.ration ?? ''} ${r.operator ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = asc ? 1 : -1;
    return list.sort((a, b) => {
      switch (sort) {
        case 'lot':
          return dir * (a.lotName ?? '').localeCompare(b.lotName ?? '');
        case 'kg':
          return dir * (a.kg - b.kg);
        case 'kgPerHead':
          return dir * ((a.kgPerHead ?? 0) - (b.kgPerHead ?? 0));
        case 'costPerHead':
          return dir * ((a.costPerHead ?? 0) - (b.costPerHead ?? 0));
        default:
          return dir * (new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
      }
    });
  }, [rows, query, meal, operator, ration, fromDate, toDate, sort, asc]);

  const totals = useMemo(() => {
    const kg = filtered.reduce((s, r) => s + r.kg, 0);
    const cost = filtered.reduce((s, r) => s + r.cost, 0);
    const pens = new Set(filtered.map((r) => r.lotId)).size;
    return { kg, cost, pens };
  }, [filtered]);

  function sortBy(key: SortKey) {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(key === 'lot');
    }
  }

  function exportCsv() {
    const csv = toCsv(
      [t('Fecha'), 'Corral', 'Grupo', 'Ración', 'Comida', 'Operador', 'Cabezas', 'kg', 'kg/cab', 'kg MS/cab', 'Costo', 'Costo/cab'],
      filtered.map((r) => [
        r.at ?? '',
        r.lotName ?? '',
        r.groupName ?? '',
        r.ration ?? '',
        r.meal ?? '',
        r.operator ?? '',
        r.headCount ?? '',
        r.kg.toFixed(1),
        r.kgPerHead?.toFixed(2) ?? '',
        r.dmKgPerHead?.toFixed(2) ?? '',
        Math.round(r.cost),
        r.costPerHead?.toFixed(0) ?? '',
      ]),
    );
    downloadCsv(`virtus-feed-descargas-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (loading) return <Spinner label={t('Cargando descargas…')} />;
  if (error) return <DataError message={error} />;

  const arrow = (key: SortKey) => (sort === key ? (asc ? ' ▲' : ' ▼') : '');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('Descargas')}
          subtitle={t('{v1} de {v2} entregas · {v3} corrales · {v4} · {v5}', { v1: filtered.length, v2: rows.length, v3: totals.pens, v4: formatWeight(
            totals.kg,
            unit,
          ), v5: formatMoney(totals.cost, currency) })}
          action={
            <Button onClick={exportCsv} disabled={!filtered.length}>
              {t('Exportar CSV')}
            </Button>
          }
        />
        <FilterPanel
          activeCount={
            [query.trim(), meal, operator, ration, fromDate, toDate].filter(Boolean).length
          }
          onClear={() => {
            setQuery('');
            setMeal('');
            setOperator('');
            setRation('');
            setFromDate('');
            setToDate('');
          }}
        >
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label>{t('Buscar')}</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Corral, grupo, ración, operador')}
            />
          </div>
          <div>
            <Label>{t('Ración')}</Label>
            <Select value={ration} onChange={(e) => setRation(e.target.value)}>
              <option value="">{t('Todas')}</option>
              {rations.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('Comida')}</Label>
            <Select value={meal} onChange={(e) => setMeal(e.target.value)}>
              <option value="">{t('Todas')}</option>
              {meals.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('Operador')}</Label>
            <Select value={operator} onChange={(e) => setOperator(e.target.value)}>
              <option value="">{t('Todos')}</option>
              {operators.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('Desde')}</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>{t('Hasta')}</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
        </div>
        </FilterPanel>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title={t('Sin descargas')}
            hint={t('Las entregas aparecen aquí en cuanto el mixer descarga en un corral y la app sincroniza.')}
          />
        ) : (
          <TableWrap>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>
                    <button onClick={() => sortBy('at')}>{t('Fecha')}{arrow('at')}</button>
                  </Th>
                  <Th>
                    <button onClick={() => sortBy('lot')}>{t('Corral')}{arrow('lot')}</button>
                  </Th>
                  <Th>{t('Grupo / ración')}</Th>
                  <Th right>{t('Cab.')}</Th>
                  <Th right>
                    <button onClick={() => sortBy('kg')}>{t('Entregado')}{arrow('kg')}</button>
                  </Th>
                  <Th right>
                    <button onClick={() => sortBy('kgPerHead')}>{t('kg/cab')}{arrow('kgPerHead')}</button>
                  </Th>
                  <Th right>{t('kg MS/cab')}</Th>
                  <Th right>
                    <button onClick={() => sortBy('costPerHead')}>{t('Costo/cab')}{arrow('costPerHead')}</button>
                  </Th>
                  <Th>{t('Operador')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <Td>{formatDateTime(r.at)}</Td>
                    <Td>
                      {r.lotId ? (
                        <Link
                          to={`/pens/${r.lotId}`}
                          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                        >
                          {r.lotName ?? '—'}
                        </Link>
                      ) : (
                        (r.lotName ?? '—')
                      )}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {r.groupName && <Badge tone="brand">{r.groupName}</Badge>}
                        <span className="text-slate-500 dark:text-slate-400">{r.ration ?? '—'}</span>
                        {r.meal && <Badge>{r.meal}</Badge>}
                      </span>
                    </Td>
                    <Td right>{r.headCount ?? '—'}</Td>
                    <Td right className="font-medium">
                      {formatWeight(r.kg, unit)}
                    </Td>
                    <Td right>{formatNumber(r.kgPerHead, 2)}</Td>
                    <Td right className={cx(!r.dmKgPerHead && 'text-slate-400')}>
                      {formatNumber(r.dmKgPerHead, 2)}
                    </Td>
                    <Td right>{formatMoney(r.costPerHead, currency)}</Td>
                    <Td>{r.operator ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {filtered.length > 500 && (
          <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Mostrando las primeras 500 filas de {filtered.length}. Afine los filtros o exporte el CSV para verlas todas.
          </p>
        )}
      </Card>
    </div>
  );
}
