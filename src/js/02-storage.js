// ── Shared storage keys + tiny helpers ───────────────────────────
// LS_WORKER / LS_QUEUE / LS_LOGS are declared in 00-platform.js.
var LS_OPERATORS = 'vf_operators';

function getQueue(){ try{ return JSON.parse(localStorage.getItem(LS_QUEUE)||'[]'); }catch(e){ return []; } }
function getLogs(){ try{ return JSON.parse(localStorage.getItem(LS_LOGS)||'[]'); }catch(e){ return []; } }

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// currentWorker (declared in 00-platform.js) holds BOTH the cloud account
// (id, email) and the person running the mixer (name, role, operatorId). They
// are not the same thing and must never be merged — one tablet, one account,
// many operators through the day.
try{ currentWorker = JSON.parse(localStorage.getItem(LS_WORKER)||'null') || {}; }catch(e){ currentWorker = {}; }
