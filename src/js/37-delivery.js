// ══════════════════════════════════════════════════════════════════
//  RECEIVE A DELIVERY
//  A truck turns up with one invoice listing several products. The ledger still
//  needs one move per ingredient — balances are per product — but the paperwork
//  is one event, so it is entered as one: several lines, one supplier, one
//  photograph of the invoice shared by all of them.
//
//  This replaces the old per-ingredient receive sheet. A card's Receive button
//  opens the same sheet with that product already on the first line, so the
//  quick single-product case costs no extra taps.
// ══════════════════════════════════════════════════════════════════

var _dlLines = [];        // [{ ingredientId, kg, amount }]
var _dlPhoto = null;      // { name, dataUrl } staged for this delivery

function openDeliverySheet(prefillIngredientId){
  var ings = getIngredients().filter(function(i){ return i.active !== false; });
  if(!ings.length){ showToast(T('Add an ingredient first'), 'warn'); return; }

  _dlLines = [{ ingredientId: prefillIngredientId || ings[0].id, kg: '', amount: '' }];
  _dlPhoto = null;
  document.getElementById('dl-supplier').value = '';
  document.getElementById('dl-note').value = '';
  _renderDelivery();
  document.getElementById('delivery-overlay').classList.add('open');
}

function closeDeliverySheet(){
  // A photo staged but never saved is referenced by nothing — drop the file
  // rather than leave it for the orphan sweep.
  if(_dlPhoto) invoiceDeleteLocal(_dlPhoto.name);
  _dlPhoto = null;
  document.getElementById('delivery-overlay').classList.remove('open');
}

function _renderDelivery(){
  var ings = getIngredients().filter(function(i){ return i.active !== false; });

  document.getElementById('dl-lines').innerHTML = _dlLines.map(function(l, i){
    return '<div class="dl-line">' +
      '<div class="dl-line-top">' +
        '<select class="dl-ing" onchange="_dlSet(' + i + ',\'ingredientId\',this.value)">' +
          ings.map(function(g){
            return '<option value="' + g.id + '"' + (g.id === l.ingredientId ? ' selected' : '') + '>' +
                   esc(g.name) + '</option>';
          }).join('') +
        '</select>' +
        (_dlLines.length > 1
          ? '<button type="button" class="dl-x" onclick="_dlRemove(' + i + ')">&#10005;</button>'
          : '') +
      '</div>' +
      '<div class="dl-line-bot">' +
        '<div class="dl-f"><label>' + esc(T('Kilos')) + '</label>' +
          '<input type="number" inputmode="decimal" step="1" value="' + esc(l.kg) + '" ' +
            'oninput="_dlSet(' + i + ',\'kg\',this.value)"></div>' +
        // One amount per line, because that is how an invoice is printed: a
        // figure against each product. The per-kg price is derived from it.
        '<div class="dl-f"><label>' + esc(T('Line amount (₲)')) + '</label>' +
          '<input type="number" inputmode="decimal" step="1" value="' + esc(l.amount) + '" ' +
            'oninput="_dlSet(' + i + ',\'amount\',this.value)"></div>' +
      '</div>' +
      (l.kg > 0 && l.amount > 0
        ? '<div class="dl-per">' + Math.round(l.amount / l.kg).toLocaleString('es-PY') +
          ' ₲/kg</div>'
        : '') +
    '</div>';
  }).join('');

  var tk = _dlLines.reduce(function(a, l){ return a + (parseFloat(l.kg) || 0); }, 0);
  var ta = _dlLines.reduce(function(a, l){ return a + (parseFloat(l.amount) || 0); }, 0);
  document.getElementById('dl-total').innerHTML =
    '<span>' + Math.round(tk).toLocaleString('es-PY') + ' kg</span>' +
    (ta > 0 ? '<span>₲ ' + Math.round(ta).toLocaleString('es-PY') + '</span>' : '');

  _dlPaintPhoto();
}

function _dlSet(i, key, val){
  if(!_dlLines[i]) return;
  _dlLines[i][key] = val;
  // Only the derived figures need redrawing; re-rendering the whole list on
  // every keystroke would take the focus out of the field being typed in.
  if(key === 'ingredientId'){ _renderDelivery(); return; }
  var l = _dlLines[i];
  var host = document.querySelectorAll('#dl-lines .dl-line')[i];
  var per  = host && host.querySelector('.dl-per');
  var txt  = (l.kg > 0 && l.amount > 0)
    ? Math.round(l.amount / l.kg).toLocaleString('es-PY') + ' ₲/kg' : '';
  if(per) per.textContent = txt;
  else if(txt && host){
    var d = document.createElement('div'); d.className = 'dl-per'; d.textContent = txt;
    host.appendChild(d);
  }
  var tk = _dlLines.reduce(function(a, x){ return a + (parseFloat(x.kg) || 0); }, 0);
  var ta = _dlLines.reduce(function(a, x){ return a + (parseFloat(x.amount) || 0); }, 0);
  document.getElementById('dl-total').innerHTML =
    '<span>' + Math.round(tk).toLocaleString('es-PY') + ' kg</span>' +
    (ta > 0 ? '<span>₲ ' + Math.round(ta).toLocaleString('es-PY') + '</span>' : '');
}

function _dlAddLine(){
  var ings = getIngredients().filter(function(i){ return i.active !== false; });
  // Default to a product not already on the delivery: the same one twice is
  // almost always a mis-tap, and two moves for one product read as a duplicate.
  var used = _dlLines.map(function(l){ return l.ingredientId; });
  var next = ings.filter(function(i){ return used.indexOf(i.id) === -1; })[0] || ings[0];
  _dlLines.push({ ingredientId: next.id, kg: '', amount: '' });
  _renderDelivery();
}

function _dlRemove(i){
  _dlLines.splice(i, 1);
  _renderDelivery();
}

async function _dlTakePhoto(){
  var shot = await invoiceCapture();
  if(!shot) return;
  if(_dlPhoto) invoiceDeleteLocal(_dlPhoto.name);   // replacing, not collecting
  _dlPhoto = shot;
  _dlPaintPhoto();
}

function _dlDropPhoto(){
  if(_dlPhoto) invoiceDeleteLocal(_dlPhoto.name);
  _dlPhoto = null;
  _dlPaintPhoto();
}

function _dlPaintPhoto(){
  var host = document.getElementById('dl-photo');
  if(!host) return;
  host.innerHTML = _dlPhoto
    ? '<div class="es-photo-has">' +
        '<img src="' + _dlPhoto.dataUrl + '" alt="">' +
        '<div class="es-photo-side">' +
          '<div class="es-photo-ok">&#10003; ' + esc(T('Invoice attached')) + '</div>' +
          '<button type="button" class="es-photo-x" onclick="_dlDropPhoto()">' +
            esc(T('Remove')) + '</button>' +
        '</div>' +
      '</div>'
    : '<button type="button" class="es-photo-btn" onclick="_dlTakePhoto()">' +
        '&#128247; ' + esc(T('Photograph the invoice')) + '</button>';
}

function saveDelivery(){
  var lines = _dlLines.filter(function(l){ return parseFloat(l.kg) > 0; });
  if(!lines.length){ showToast(T('Enter an amount'), 'warn'); return; }

  var seen = {};
  for(var i = 0; i < lines.length; i++){
    if(seen[lines[i].ingredientId]){
      showToast(T('The same ingredient is on two lines'), 'warn');
      return;
    }
    seen[lines[i].ingredientId] = 1;
  }

  var supplier = (document.getElementById('dl-supplier').value || '').trim() || null;
  var note     = (document.getElementById('dl-note').value || '').trim() || null;
  var deliveryId = 'dlv-' + uid();

  lines.forEach(function(l){
    var kg = parseFloat(l.kg);
    var amt = parseFloat(l.amount) || 0;
    receiveStock(l.ingredientId, kg, {
      totalCost: amt > 0 ? amt : null,
      supplier: supplier,
      note: note,
      photo: _dlPhoto ? _dlPhoto.name : null,
      deliveryId: deliveryId
    });
  });

  // The sheet no longer owns the file — the moves do. Clearing it first stops
  // the close handler deleting a photo the ledger now points at.
  _dlPhoto = null;
  closeDeliverySheet();
  renderIngredients();
  syncQueue();
  showToast(T('Delivery recorded') + ' · ' + lines.length + ' ' +
            T(lines.length === 1 ? 'product' : 'products'), 'success');
}
