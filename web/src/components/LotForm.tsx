import { useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { useWriter } from '../state/useWriter';
import { EntityForm, fnum, fstr } from './form';
import type { FormValues } from './form';
import { lotRow } from '../lib/write';
import type { Lot } from '../lib/types';

/**
 * The pen record, in one place so the Gestión table and the pen page edit it
 * through the same fields and the same validation.
 *
 * Two things are deliberately absent. The feed factor is not here — it belongs
 * next to the bunk-reading ledger that also moves it, with the rails applied.
 * Nor is the ration: groups own that now, and `lot.ration_id` only survives for
 * the app's older code paths.
 */
export function LotFormModal({
  lot,
  onClose,
  onDeleted,
}: {
  lot: Lot | 'new';
  onClose: () => void;
  /** Called after a successful delete, so a pen page can navigate away. */
  onDeleted?: () => void;
}) {
  const t = useT();
  const { cycles, lots, lotGroups, deliveries } = useData();
  const { cycleId } = usePrefs();
  const { run } = useWriter();

  const defaultCycle = cycleId || cycles.find((c) => c.active !== false)?.id || cycles[0]?.id || '';
  const deliveryCount = lot === 'new' ? 0 : deliveries.filter((d) => d.lot_id === lot.id).length;

  const fields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: t('Corral 1') },
    { key: 'pen_code', label: t('Código'), half: true, placeholder: t('A-01') },
    { key: 'head_count', label: t('Cabezas'), type: 'number' as const, min: 0, step: 1, half: true,
      hint: t('El denominador de casi todo: kg/cab, costo/cab, consumo.') },
    { key: 'route_order', label: t('Orden de recorrido'), type: 'number' as const, min: 0, step: 1, half: true },
    { key: 'category', label: t('Categoría'), type: 'select' as const, half: true, options: [
      { value: '', label: '—' },
      { value: 'novillo', label: t('Novillo') },
      { value: 'vaquilla', label: t('Vaquilla') },
      { value: 'toro', label: t('Toro') },
      { value: 'vaca', label: t('Vaca') },
    ] },
    { key: 'cycle_id', label: t('Ciclo'), type: 'select' as const, half: true,
      options: [{ value: '', label: t('— sin ciclo —') }, ...cycles.map((c) => ({ value: c.id, label: c.name }))] },
    { key: 'entry_date', label: t('Fecha de entrada'), type: 'date' as const, half: true },
    { key: 'entry_weight_kg', label: t('Peso de entrada (kg/cab)'), type: 'number' as const, min: 0, step: 1, half: true },
    { key: 'avg_weight_kg', label: t('Peso promedio actual (kg/cab)'), type: 'number' as const, min: 0, step: 1, half: true,
      hint: t('Se actualiza solo al registrar una pesada.') },
    { key: 'target_weight_kg', label: t('Peso objetivo (kg/cab)'), type: 'number' as const, min: 0, step: 1, half: true },
    { key: 'avg_age_months', label: t('Edad promedio (meses)'), type: 'number' as const, min: 0, step: 1, half: true },
    // The app has the same switch on its own pen sheet, writing the same
    // column through the ordinary pen sync — so it can be set from either side.
    { key: 'confirm_head_count', label: t('Confirmar cabezas al descargar'), type: 'checkbox' as const, half: true,
      hint: t('La app pregunta las cabezas en este corral antes de registrar la descarga.') },
    { key: 'active', label: t('Activo'), type: 'checkbox' as const, half: true },
    { key: 'notes', label: t('Notas'), type: 'textarea' as const },
  ];

  const initial: FormValues =
    lot === 'new'
      ? { name: '', pen_code: '', head_count: '0', route_order: String(lots.length + 1), category: '',
          cycle_id: defaultCycle, entry_date: '', entry_weight_kg: '', avg_weight_kg: '', target_weight_kg: '',
          avg_age_months: '', confirm_head_count: false, active: true, notes: '' }
      : { name: lot.name, pen_code: lot.pen_code ?? '', head_count: String(lot.head_count ?? 0),
          route_order: String(lot.route_order ?? 0), category: lot.category ?? '', cycle_id: lot.cycle_id ?? '',
          entry_date: lot.entry_date ?? '', entry_weight_kg: lot.entry_weight_kg?.toString() ?? '',
          avg_weight_kg: lot.avg_weight_kg?.toString() ?? '', target_weight_kg: lot.target_weight_kg?.toString() ?? '',
          avg_age_months: lot.avg_age_months?.toString() ?? '',
          confirm_head_count: lot.confirm_head_count === true,
          active: lot.active !== false, notes: lot.notes ?? '' };

  return (
    <EntityForm
      title={lot === 'new' ? t('Nuevo corral') : t('Editar {v1}', { v1: lot.name })}
      fields={fields}
      initial={initial}
      wide
      onClose={onClose}
      onSave={(v) =>
        run(
          (w) =>
            w.save(
              'vf_lots',
              lotRow({
                ...(lot === 'new' ? {} : lot),
                name: String(v.name).trim(),
                pen_code: fstr(v.pen_code),
                head_count: fnum(v.head_count) ?? 0,
                route_order: fnum(v.route_order) ?? 0,
                category: fstr(v.category),
                cycle_id: fstr(v.cycle_id),
                entry_date: fstr(v.entry_date),
                entry_weight_kg: fnum(v.entry_weight_kg),
                avg_weight_kg: fnum(v.avg_weight_kg),
                target_weight_kg: fnum(v.target_weight_kg),
                avg_age_months: fnum(v.avg_age_months),
                confirm_head_count: Boolean(v.confirm_head_count),
                active: Boolean(v.active),
                notes: fstr(v.notes),
              }),
            ),
          lot === 'new' ? t('Corral creado') : t('Corral guardado'),
        )
      }
      onDelete={
        lot === 'new'
          ? undefined
          : async () => {
              const err = await run(async (w) => {
                // Membership goes with the pen; an orphan row would keep a
                // deleted pen in a group's load sheet.
                for (const m of lotGroups.filter((x) => x.lot_id === lot.id)) {
                  await w.remove('vf_lot_groups', m.id);
                }
                await w.remove('vf_lots', lot.id);
              }, t('Corral eliminado'));
              if (!err) onDeleted?.();
              return err;
            }
      }
      deleteWarning={
        deliveryCount > 0
          ? t('Este corral tiene {v1} descargas registradas. Se borra el corral, no su historial: esas filas conservan el nombre guardado, pero ya no se podrán abrir desde acá. Si solo quiere sacarlo del recorrido, desmarque "Activo".', { v1: deliveryCount })
          : t('Se elimina el corral y su pertenencia a los grupos.')
      }
    />
  );
}
