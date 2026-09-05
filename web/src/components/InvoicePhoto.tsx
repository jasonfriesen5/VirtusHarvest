import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useT } from '../state/PrefsProvider';

/**
 * The paper invoice behind a stock receipt.
 *
 * The bucket is private, so the image is reachable only through a signed URL
 * minted on demand for the account that owns it. We mint it when the row is
 * rendered rather than up front: an inventory page can list two hundred moves,
 * and signing every one of them would be two hundred requests for links nobody
 * clicks.
 */
export function InvoicePhoto({ path }: { path: string | null }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || url || !path) return;
    let cancelled = false;
    // Signed links are short-lived by design; one hour outlives any reading of
    // an invoice and keeps a copied URL from becoming a permanent public one.
    supabase.storage
      .from('invoices')
      .createSignedUrl(path, 3600)
      .then((r) => {
        if (cancelled) return;
        if (r.data?.signedUrl) setUrl(r.data.signedUrl);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, path]);

  if (!path) return <span className="text-slate-300 dark:text-slate-600">—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800"
      >
        {t('Ver factura')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          {failed ? (
            <p className="text-sm text-white">{t('No se pudo abrir la factura.')}</p>
          ) : url ? (
            <img
              src={url}
              alt={t('Factura')}
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="text-sm text-white">{t('Cargando…')}</p>
          )}
          <button
            type="button"
            aria-label={t('Cerrar')}
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl text-white"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
