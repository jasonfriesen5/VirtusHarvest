// ══════════════════════════════════════════════════════════════════
//  INVOICE PHOTOS
//  A delivery arrives with a paper invoice, and the person unloading it is the
//  only one who ever holds that paper. Photographing it at the receive sheet is
//  the one moment the number on the page and the number in the app can be
//  checked against each other later.
//
//  The photo is written to the device first and uploaded on the next sync, like
//  every other record here: deliveries arrive where the signal is worst, and a
//  receive that fails because a photo could not upload would be worse than no
//  photo at all.
// ══════════════════════════════════════════════════════════════════

var VF_INVOICE_DIR    = 'invoices';
var VF_INVOICE_BUCKET = 'invoices';

function _invoicePlugins(){
  var p = (window.Capacitor && window.Capacitor.Plugins) || {};
  return { cam: p.Camera || null, fs: p.Filesystem || null };
}

function invoiceSupported(){
  var p = _invoicePlugins();
  return !!(p.cam && p.fs);
}

// Take (or pick) the photo and stage it on the device. Returns
// { name, dataUrl } — the name is what travels on the stock move.
async function invoiceCapture(){
  var p = _invoicePlugins();
  if(!p.cam || !p.fs){ showToast(T('Camera not available on this device'), 'warn'); return null; }

  try{
    // 1600px at 70% is a legible invoice at roughly 200-400 KB. Full-resolution
    // tablet photos are 4-6 MB, which is a slow upload on rural data and buys
    // nothing you can read.
    var shot = await p.cam.getPhoto({
      quality: 70, width: 1600, correctOrientation: true,
      allowEditing: false, resultType: 'base64', source: 'PROMPT',
      promptLabelHeader: T('Invoice'),
      promptLabelPhoto:  T('Choose a photo'),
      promptLabelPicture: T('Take a photo')
    });
    if(!shot || !shot.base64String) return null;

    var name = 'inv-' + uid() + '.jpg';
    await p.fs.writeFile({
      path: VF_INVOICE_DIR + '/' + name,
      data: shot.base64String,
      directory: 'DATA',
      recursive: true
    });
    return { name: name, dataUrl: 'data:image/jpeg;base64,' + shot.base64String };
  }catch(e){
    // A cancelled picker throws here too — that is not an error worth a toast.
    if(!/cancel/i.test(String(e && e.message))) console.warn('invoiceCapture:', e);
    return null;
  }
}

async function invoiceReadLocal(name){
  var p = _invoicePlugins();
  if(!p.fs || !name) return null;
  try{
    var r = await p.fs.readFile({ path: VF_INVOICE_DIR + '/' + name, directory: 'DATA' });
    return 'data:image/jpeg;base64,' + r.data;
  }catch(e){ return null; }
}

async function invoiceDeleteLocal(name){
  var p = _invoicePlugins();
  if(!p.fs || !name) return;
  try{ await p.fs.deleteFile({ path: VF_INVOICE_DIR + '/' + name, directory: 'DATA' }); }catch(e){}
}

// ── Upload ────────────────────────────────────────────────────────
// Runs at the start of a push so photo_path is already on the row when the
// normal upsert sends it. A failed upload leaves photoLocal in place and the
// move dirty, so the next sync tries again.
async function invoiceUploadPending(sb, uidv){
  var moves = _lsGet(LS_STOCK_MOVES);
  var pending = moves.filter(function(m){ return m.photoLocal && !m.photoPath; });
  if(!pending.length) return 0;

  // One truck, one invoice, several products. The lines share a delivery id, so
  // the image is uploaded once and every line points at the same object —
  // uploading per line would put the same photograph in the bucket five times.
  var groups = {};
  pending.forEach(function(m){
    var key = m.deliveryId || m.id;
    (groups[key] = groups[key] || []).push(m);
  });

  var done = 0;
  var keys = Object.keys(groups);
  for(var g = 0; g < keys.length; g++){
    var lines = groups[keys[g]];
    try{
      var dataUrl = await invoiceReadLocal(lines[0].photoLocal);
      if(!dataUrl){
        // File gone — stop retrying forever, but keep the ledger untouched.
        lines.forEach(function(m){ m.photoLocal = null; _markDirty('vf_stock_moves', m.id); });
        continue;
      }

      var blob = await (await fetch(dataUrl)).blob();
      var path = uidv + '/' + keys[g] + '.jpg';
      var up = await sb.storage.from(VF_INVOICE_BUCKET)
                 .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if(up && up.error){ console.warn('invoice upload:', up.error.message); continue; }

      var name = lines[0].photoLocal;
      lines.forEach(function(m){
        m.photoPath  = path;
        m.photoLocal = null;
        _markDirty('vf_stock_moves', m.id);
      });
      // The device copy has done its job. Keeping it would fill a tablet that
      // never gets cleared, and the cloud copy is the one the console reads.
      await invoiceDeleteLocal(name);
      done++;
    }catch(e){ console.warn('invoice upload:', e); }
  }
  _lsSet(LS_STOCK_MOVES, moves);
  return done;
}

// Staged photos whose receive was never saved would otherwise sit on the device
// for good. Called after a sync, when the ledger is settled.
async function invoiceSweepOrphans(){
  var p = _invoicePlugins();
  if(!p.fs) return;
  try{
    var dir = await p.fs.readdir({ path: VF_INVOICE_DIR, directory: 'DATA' });
    var keep = {};
    _lsGet(LS_STOCK_MOVES).forEach(function(m){ if(m.photoLocal) keep[m.photoLocal] = 1; });
    (dir.files || []).forEach(function(f){
      var n = f.name || f;
      if(!keep[n]) invoiceDeleteLocal(n);
    });
  }catch(e){}
}

// ── Viewing ───────────────────────────────────────────────────────
// The bucket is private, so a stored photo needs a short-lived signed URL.
async function invoiceUrl(move){
  if(!move) return null;
  if(move.photoLocal) return await invoiceReadLocal(move.photoLocal);
  if(!move.photoPath) return null;
  try{
    var sb = getSupabase();
    var r = await sb.storage.from(VF_INVOICE_BUCKET).createSignedUrl(move.photoPath, 3600);
    return (r && r.data && r.data.signedUrl) || null;
  }catch(e){ return null; }
}

async function openInvoiceViewer(moveId){
  var move = getStockMoves().filter(function(m){ return m.id === moveId; })[0];
  var url  = await invoiceUrl(move);
  if(!url){ showToast(T('Photo not available offline'), 'warn'); return; }
  document.getElementById('inv-view-img').src = url;
  document.getElementById('inv-view-overlay').classList.add('open');
}

function closeInvoiceViewer(){
  document.getElementById('inv-view-overlay').classList.remove('open');
  document.getElementById('inv-view-img').src = '';
}
