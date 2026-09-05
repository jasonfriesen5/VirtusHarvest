import { useEffect, useMemo, useState } from 'react';
import { fenexCustomers } from '../lib/fenexClient';
import type { FenexCustomer, Issuer } from '../lib/fenexClient';
import { normalise, validate } from '../lib/fenexPayload';
import type { FenexRemission, FenexRequest } from '../lib/fenexPayload';
import {
  EMISSION_RESPONSIBILITIES,
  FREIGHT_RESPONSIBILITIES,
  REASONS,
  TRANSPORT_TYPES,
  splitRuc,
} from '../lib/sifen';
import GeographyPicker from './GeographyPicker';
import type { GeoValue } from './GeographyPicker';
import { Button, Input, Label, Modal, Select } from './ui';
// DEMO — remove with the trial toggle before launch.
import { isDemo } from '../lib/fenexDemo';

/**
 * The Nota de Remisión before it is sent.
 *
 * There is no sandbox and no cancellation: once SET accepts this, it is a legal
 * document with a real number and undoing it means a phone call. So the sheet
 * validates against Fenex's own rules continuously, and will not let the send
 * button light up until every one passes.
 */

type Field = keyof FenexRemission;

export default function RemisionForm({
  initial,
  busy,
  issuers,
  issuerId,
  onIssuerChange,
  onClose,
  onSaveDraft,
  onSend,
}: {
  initial: FenexRequest;
  busy: boolean;
  issuers: Issuer[];
  issuerId: string | null;
  onIssuerChange: (id: string) => void;
  onClose: () => void;
  onSaveDraft: (req: FenexRequest) => void;
  onSend: (req: FenexRequest) => void;
}) {
  const [req, setReq] = useState<FenexRequest>(initial);
  const [confirming, setConfirming] = useState(false);
  const [customers, setCustomers] = useState<FenexCustomer[] | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const r = req.remission;
  const set = (patch: Partial<FenexRemission>) =>
    setReq((prev) => ({ ...prev, remission: { ...prev.remission, ...patch } }));
  const field = (k: Field, v: string) => set({ [k]: v } as Partial<FenexRemission>);

  // Reloaded whenever the issuer changes. The same buyer is a different
  // customer record in each Fenex account, so a list fetched under one issuer
  // is meaningless under another.
  useEffect(() => {
    let cancelled = false;
    setCustomers(null);
    setCustomerError(null);
    fenexCustomers(issuerId)
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch((e) => {
        if (!cancelled) setCustomerError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [issuerId]);

  /** Picking a buyer fills the receptor block from Fenex's own record. */
  function chooseCustomer(id: string) {
    const c = customers?.find((x) => String(x.id) === id);
    if (!c) {
      set({ customerId: null });
      return;
    }
    const raw = String(c.ruc ?? '');
    const split = c.dv ? { ruc: raw, dv: String(c.dv) } : splitRuc(raw);
    set({
      customerId: String(c.id),
      receiverRuc: split.ruc,
      receiverDv: split.dv,
      receiverName: String(c.legalName ?? c.name ?? ''),
      receiverAddress: String(c.address ?? r.receiverAddress),
    });
  }

  const issues = useMemo(() => validate(normalise(req)), [req]);
  const ready = issues.length === 0;

  const geo = (prefix: 'receiver' | 'departure' | 'delivery'): GeoValue => ({
    departmentCode: r[`${prefix}DepartmentCode`],
    departmentName: r[`${prefix}DepartmentName`],
    districtCode: r[`${prefix}DistrictCode`],
    districtName: r[`${prefix}DistrictName`],
    cityCode: r[`${prefix}CityCode`],
    cityName: r[`${prefix}CityName`],
  });

  const setGeo = (prefix: 'receiver' | 'departure' | 'delivery', v: GeoValue) =>
    set({
      [`${prefix}DepartmentCode`]: v.departmentCode,
      [`${prefix}DepartmentName`]: v.departmentName,
      [`${prefix}DistrictCode`]: v.districtCode,
      [`${prefix}DistrictName`]: v.districtName,
      [`${prefix}CityCode`]: v.cityCode,
      [`${prefix}CityName`]: v.cityName,
    } as Partial<FenexRemission>);

  const T = ({ k, label, type = 'text', wide }: { k: Field; label: string; type?: string; wide?: boolean }) => (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <Label>{label}</Label>
      <Input type={type} value={String(r[k] ?? '')} onChange={(e) => field(k, e.target.value)} />
    </div>
  );

  const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {title}
      </h3>
      {note && <p className="mt-0.5 mb-2 text-xs text-slate-400 dark:text-slate-500">{note}</p>}
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );

  return (
    <Modal title="Nota de Remisión Electrónica" onClose={onClose} wide>
      {isDemo() && (
        <p className="mb-4 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
          <strong>Trial mode.</strong> Buyers and geography are simulated, and sending produces a
          document marked <em>NO VALIDO</em>. Nothing reaches Fenex or SET.
        </p>
      )}

      <div className="space-y-6">
        <Section
          title="Emisor"
          note="The document is issued by whoever's Fenex account sends it — their RUC, timbrado and numbering come from Fenex, not from here."
        >
          <div>
            <Label>Se emite a nombre de</Label>
            <Select
              value={issuerId ?? ''}
              onChange={(e) => onIssuerChange(e.target.value)}
            >
              {issuers.length === 0 && <option value="">— no linked issuer —</option>}
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label ?? i.fenex_email ?? i.id}
                  {i.razon_social ? ` · ${i.razon_social}` : ''}
                </option>
              ))}
            </Select>
            {issuers.length > 1 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Timbrado and document number come from this account. Add another issuer in
                Account → Nota de Remisión.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Datos del receptor"
          note="Pick the buyer from this issuer's Fenex records. The fields below fill in from it; corrections apply to this document only."
        >
          <div>
            <Label>Cliente en Fenex</Label>
            <Select
              value={r.customerId ?? ''}
              onChange={(e) => chooseCustomer(e.target.value)}
              disabled={customers == null && customerError == null}
            >
              <option value="">
                {customers == null && customerError == null ? 'Loading buyers…' : '— sin vincular —'}
              </option>
              {(customers ?? []).map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.legalName ?? c.name ?? c.id)}
                  {c.ruc ? ` · ${c.ruc}` : ''}
                </option>
              ))}
            </Select>
            {customerError && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Could not load buyers: {customerError}. The fields below still stand on their own.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <T k="receiverName" label="Razón social" wide />
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="col-span-2">
                <Label>RUC (sin DV)</Label>
                <Input value={r.receiverRuc} onChange={(e) => field('receiverRuc', e.target.value)} />
              </div>
              <div>
                <Label>DV</Label>
                <Input value={r.receiverDv} onChange={(e) => field('receiverDv', e.target.value)} />
              </div>
            </div>
            <T k="receiverAddress" label="Dirección" wide />
            <div>
              <Label>Tipo de contribuyente</Label>
              <Select
                value={r.receiverTaxpayerType}
                onChange={(e) => field('receiverTaxpayerType', e.target.value)}
              >
                <option value="1">1 — Persona física</option>
                <option value="2">2 — Persona jurídica</option>
              </Select>
            </div>
          </div>
          <GeographyPicker value={geo('receiver')} onChange={(v) => setGeo('receiver', v)} />
        </Section>

        <Section title="Datos del traslado">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Motivo</Label>
              <Select
                value={String(r.reasonCode)}
                onChange={(e) => {
                  const codeNum = Number(e.target.value);
                  // The description must match the code exactly, so it is set
                  // from the table rather than typed.
                  set({
                    reasonCode: codeNum,
                    reasonDescription: codeNum === 99 ? '' : REASONS[codeNum],
                  });
                }}
              >
                {Object.entries(REASONS).map(([c, d]) => (
                  <option key={c} value={c}>{c} — {d}</option>
                ))}
              </Select>
            </div>

            {r.reasonCode === 99 && (
              <T k="reasonDescription" label="Descripción del motivo (5–60)" wide />
            )}

            {r.reasonCode === 1 && (
              <div>
                <Label>Fecha futura de la factura</Label>
                <Input
                  type="date"
                  value={r.futureInvoiceIssueDate ?? ''}
                  onChange={(e) => set({ futureInvoiceIssueDate: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label>Responsable de emisión</Label>
              <Select
                value={String(r.emissionResponsibilityCode)}
                onChange={(e) => {
                  const c = Number(e.target.value);
                  set({
                    emissionResponsibilityCode: c,
                    emissionResponsibilityDescription: EMISSION_RESPONSIBILITIES[c],
                  });
                }}
              >
                {Object.entries(EMISSION_RESPONSIBILITIES).map(([c, d]) => (
                  <option key={c} value={c}>{d}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Tipo de transporte</Label>
              <Select
                value={String(r.transportType)}
                onChange={(e) => {
                  const c = Number(e.target.value);
                  set({ transportType: c, transportTypeDescription: TRANSPORT_TYPES[c] });
                }}
              >
                {Object.entries(TRANSPORT_TYPES).map(([c, d]) => (
                  <option key={c} value={c}>{d}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Responsable del flete</Label>
              <Select
                value={String(r.freightResponsibility)}
                onChange={(e) => set({ freightResponsibility: Number(e.target.value) })}
              >
                {Object.entries(FREIGHT_RESPONSIBILITIES).map(([c, d]) => (
                  <option key={c} value={c}>{d}</option>
                ))}
              </Select>
            </div>

            <T k="issueDate" label="Fecha de emisión" type="date" />
            <T k="transportStartDate" label="Inicio del traslado" type="date" />
            <div>
              <Label>Fin estimado</Label>
              <Input
                type="date"
                value={r.transportEndDate ?? ''}
                onChange={(e) => set({ transportEndDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Distancia estimada (km)</Label>
              <Input
                type="number"
                min="1"
                max="99999"
                value={r.estimatedDistanceKm ?? ''}
                onChange={(e) =>
                  set({ estimatedDistanceKm: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
          </div>
        </Section>

        <Section title="Punto de salida" note="Where the truck was loaded — normally the farm.">
          <div className="grid gap-3 sm:grid-cols-2">
            <T k="departureAddress" label="Dirección" wide />
          </div>
          <GeographyPicker value={geo('departure')} onChange={(v) => setGeo('departure', v)} />
        </Section>

        <Section title="Punto de entrega">
          <div className="grid gap-3 sm:grid-cols-2">
            <T k="deliveryAddress" label="Dirección" wide />
          </div>
          <GeographyPicker value={geo('delivery')} onChange={(v) => setGeo('delivery', v)} />
        </Section>

        <Section title="Vehículo, transportista y chofer">
          <div className="grid gap-3 sm:grid-cols-2">
            <T k="vehicleType" label="Tipo de vehículo (4–10)" />
            <T k="vehicleBrand" label="Marca (máx. 10)" />
            <T k="vehiclePlate" label="Chapa" />
            <div>
              <Label>Documento del transportista</Label>
              <Select
                value={r.transporterDocumentType}
                onChange={(e) =>
                  set({ transporterDocumentType: e.target.value === 'CI' ? 'CI' : 'RUC' })
                }
              >
                <option value="RUC">RUC</option>
                <option value="CI">CI</option>
              </Select>
            </div>

            {r.transporterDocumentType === 'RUC' ? (
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <div className="col-span-2">
                  <Label>RUC del transportista</Label>
                  <Input value={r.transporterRuc} onChange={(e) => field('transporterRuc', e.target.value)} />
                </div>
                <div>
                  <Label>DV</Label>
                  <Input value={r.transporterDv} onChange={(e) => field('transporterDv', e.target.value)} />
                </div>
              </div>
            ) : (
              <T k="transporterCi" label="CI del transportista" wide />
            )}

            <T k="transporterName" label="Transportista (4–60)" wide />
            <T k="transporterFiscalAddress" label="Domicilio fiscal" wide />
            <T k="driverName" label="Chofer (4–60)" />
            <T k="driverCi" label="CI del chofer" />
            <T k="driverAddress" label="Dirección del chofer" wide />
          </div>
        </Section>

        <Section title="Carga" note="One line per crop, weighed by your own scale, in whole kilos.">
          {req.items.map((item, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <Label>Código</Label>
                <Input
                  value={item.productCode}
                  onChange={(e) =>
                    setReq((p) => ({
                      ...p,
                      items: p.items.map((it, j) =>
                        j === i ? { ...it, productCode: e.target.value } : it,
                      ),
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-5">
                <Label>Descripción</Label>
                <Input
                  value={item.productName}
                  onChange={(e) =>
                    setReq((p) => ({
                      ...p,
                      items: p.items.map((it, j) =>
                        j === i ? { ...it, productName: e.target.value } : it,
                      ),
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Unidad</Label>
                <Input value={`${item.unitCode} · ${item.unitDescription}`} disabled />
              </div>
              <div className="sm:col-span-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={String(item.quantity)}
                  onChange={(e) =>
                    setReq((p) => ({
                      ...p,
                      items: p.items.map((it, j) =>
                        j === i ? { ...it, quantity: Math.round(Number(e.target.value) || 0) } : it,
                      ),
                    }))
                  }
                />
              </div>
            </div>
          ))}
          <p className="text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            Total {req.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} kg
          </p>
        </Section>
      </div>

      {issues.length > 0 ? (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
            {issues.length} thing{issues.length === 1 ? '' : 's'} SIFEN would reject:
          </p>
          <ul className="mt-1 space-y-0.5">
            {issues.map((i) => (
              <li key={i.field} className="text-xs text-amber-800 dark:text-amber-200">
                <span className="font-mono">{i.field}</span> — {i.message}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
            You can still save — the draft is kept and nothing is sent.
          </p>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          Every rule Fenex checks passes. The department/district/city combination is verified by
          SIFEN itself — choosing all three from the lists is what makes that safe.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={ready ? 'secondary' : 'primary'} disabled={busy} onClick={() => onSaveDraft(req)}>
          Save
        </Button>
        <Button variant="primary" disabled={busy || !ready} onClick={() => setConfirming(true)}>
          {busy ? 'Sending…' : 'Create remisión'}
        </Button>
      </div>

      {confirming && (
        <Modal title="Send this to SET?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong>{r.receiverName}</strong> · {req.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} kg
            · chapa {r.vehiclePlate}
          </p>
          {isDemo() ? (
            <p className="mt-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
              Trial mode — this produces a simulated document. Nothing is sent and no timbrado
              number is used.
            </p>
          ) : (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              This creates a real legal document and consumes a number from your timbrado. Fenex has
              no cancellation endpoint yet — undoing it means calling Jonathan. Check the buyer, the
              plate and the weight before sending.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>Back</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onSend(normalise(req));
              }}
            >
              Send to SET
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
