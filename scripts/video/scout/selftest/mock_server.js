'use strict';
/**
 * Local MOCK of the three CRM pages, only for testing the scout script without touching the real app.
 * It imitates the ids / structure known from the QA inventory of 2026-09-18 and the ARIA snapshot of 2026-09-28.
 * It is NOT the product and nothing rendered by it may be used as evidence about the product.
 * Every non-GET request is recorded; /api/save-* and /api/delete-* count as writes.
 */
const http = require('http');

const CSS = `body{margin:0;font-family:sans-serif;font-size:14px;background:#f2f2f2}
#sidebar{position:fixed;left:0;top:0;width:256px;height:100vh;background:#071527;color:#fff}
.app-header{position:fixed;left:256px;right:0;top:0;height:68px;background:#fff}
#mainHeaderProfile{position:absolute;right:60px;top:16px}
.main-content{margin-left:256px;padding:90px 20px 20px}
.card{background:#fff;border-radius:12px;margin-top:20px}
#myTab1{display:flex;list-style:none;margin:0;padding:0}#myTab1 li{flex:1}#myTab1 button{width:100%;height:64px;border:0;background:#fff}
#myTab1 button.active{border-bottom:3px solid #006af5}
table{width:100%;border-collapse:collapse}td,th{padding:12px;border-top:1px solid #ddd;text-align:left}
td.go{cursor:pointer}.sk td{height:20px}
.offcanvas{position:fixed;right:0;top:0;width:400px;height:100vh;background:#fff;display:none;z-index:50}.offcanvas.show{display:block}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;z-index:60}.modal.show{display:block}
.modal-content{width:500px;margin:30px auto;background:#fff;padding:16px}
.dropdown-menu{display:none;position:absolute;background:#fff;border:1px solid #ccc;z-index:40}.dropdown-menu.show{display:block}
.dropdown-menu a{display:block;padding:8px 16px}.tab-pane{display:none}.tab-pane.active{display:block}
.toolbar{position:absolute;right:20px;top:94px}`;

const SHELL = (title, body, script) => `<!doctype html><html><head><meta charset="utf-8"><title>Progbiz ERP</title><style>${CSS}</style></head><body>
<div id="app"><header class="app-header"><a id="mainHeaderProfile" href="javascript:void(0)"><img class="avatar" alt="img" width="30" height="30"> Mock Staffname</a></header>
<aside id="sidebar"><a id="nav-crm">CRM</a></aside>
<div class="main-content"><h1 class="page-title">${title}</h1><ol class="breadcrumb"><li>CRM</li><li>${title}</li></ol>${body}</div></div>
<script>
const $=(s)=>document.querySelector(s);const $$=(s)=>[...document.querySelectorAll(s)];
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){$$('.modal.show,.dropdown-menu.show,.offcanvas.show').forEach(x=>x.classList.remove('show'));}});
document.addEventListener('click',(e)=>{const d=e.target.closest('[data-bs-dismiss]');if(d){const m=d.closest('.modal,.offcanvas');if(m)m.classList.remove('show');}});
async function api(p,b){const r=await fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});return r.json();}
${script}
</script></body></html>`;

const FILTER = `<div class="toolbar"><button id="btn-view-A" type="button">View A</button>
<input id="filter-name" type="text" placeholder="Search here"><div id="btn-search-simple" style="display:inline-block;width:38px;height:38px;background:#eee"></div>
<a id="btn-toggle-filter" href="javascript:void(0)" onclick="$('#offcanvasRight').classList.add('show')">[filters]</a></div>
<div class="offcanvas" id="offcanvasRight"><h5 id="offcanvasRightLabel1" class="offcanvas-title">Filter</h5><button id="btn-close-filter-x" type="button" class="btn-close" data-bs-dismiss="offcanvas">x</button>
<div class="offcanvas-body"><div><label class="form-label">Date</label><select id="inputState"><option>All</option><option>Today</option><option>This Month</option></select></div>
<div><label class="form-label">Status</label><select id="status-id"><option>All</option><option>Awaiting</option><option>Interested</option></select></div>
<div><label class="form-label">Assigned To</label><select id="assignedTo"><option>All</option><option>Mock Person One</option></select></div>
<button id="btn-clear-filter" type="button">Clear</button><button id="btn-apply-filter" type="button">Apply</button></div></div>`;

const LIST_JS = (kind, cols) => `
let tab=null, term='';
function skeleton(){ $('tbody').innerHTML='<tr class="sk">'+'<td></td>'.repeat(${cols})+'</tr>'.repeat(3); $$('#myTab1 .badge').forEach(b=>b.textContent='0'); }
async function load(){ skeleton(); await new Promise(r=>setTimeout(r,700)); const d=await api('/api/${kind}/get-paged',{tab,term});
  d.tabs.forEach(t=>{const b=$('#'+t.id+' .badge'); if(b) b.textContent=t.count; $('#'+t.id).classList.toggle('active',t.id===d.active);});
  $('tbody').innerHTML = d.rows.length ? d.rows.map(r=>'<tr>'+r.map(c=>c).join('')+'</tr>').join('') : '<tr><td colspan="${cols}">No data available</td></tr>';
  $('#showing').textContent='Showing '+(d.rows.length?1:0)+' to '+d.rows.length+' of '+d.total+' entries';
  $$('td.go').forEach(td=>td.addEventListener('click',()=>{location.href='/enquiry-overview/'+td.parentElement.dataset.id;}));
  $$('tr').forEach(tr=>{ const i=tr.querySelector('td[data-id]'); if(i) tr.dataset.id=i.dataset.id; });
  $$('[id^="btn-view-overview-"]').forEach(b=>b.addEventListener('click',()=>{location.href='/enquiry-overview/'+b.id.split('-').pop();}));
  $$('[id^="btn-followup-"]').forEach(b=>b.addEventListener('click',()=>{$('#followupModal').classList.add('show');}));
}
$$('#myTab1 button[id^="tab-"]').forEach(b=>b.addEventListener('click',()=>{tab=b.id;load();}));
$('#btn-search-simple').addEventListener('click',()=>{term=$('#filter-name').value;load();});
$$('#btn-view-kanban,#btn-view-list').forEach(b=>b.addEventListener('click',()=>{}));
load();`;

const MODAL = `<div class="modal" id="followupModal"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Add FollowUp</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
<div class="modal-body"><div><span>Name : Demo Customer</span> <span>Phone : +91 9876512340</span></div>
<div><label class="form-label" for="followup-status">Followup Status :</label><select id="followup-status"><option disabled selected>Choose</option><option>Awaiting</option><option>Interested</option></select></div>
<div><label class="form-label" for="lead-quality">Lead Quality* :</label><select id="lead-quality"><option disabled selected>Choose</option><option>Cold</option><option>Warm</option><option>Hot</option></select></div>
<div><label class="form-label" for="business-value">Business Value (INR) :</label><input id="business-value" type="number"></div>
<div><label class="form-label" for="followup-description">Description :</label><textarea id="followup-description"></textarea></div>
<div><label class="form-label" for="next-followup-date">Next FollowUp Date :</label><input type="checkbox" id="no-next-followup"><label for="no-next-followup">Not Required</label><input id="next-followup-date" type="datetime-local" min="2026-09-29T14:01" value="2026-09-29T14:00"></div></div>
<div class="modal-footer"><button type="button" class="btn" data-bs-dismiss="modal">Close</button><button type="button" id="btn-save-followup" class="btn" onclick="api('/api/save-followup',{})">Save</button></div></div></div>`;

const PAGES = {
  '/leads': () => SHELL('Leads', `${FILTER.replace('btn-view-A', 'btn-view-nature').replace('View A', 'Nature View')}<button id="export-excel" type="button" style="position:absolute;right:420px;top:94px">Export Data</button>
<div class="card"><ul id="myTab1"><li><button id="tab-lead-new" type="submit" class="active">New <span class="badge">0</span></button></li><li><button id="tab-lead-infollowup" type="submit">In Follow Up <span class="badge">0</span></button></li><li><button id="tab-lead-won" type="submit">Won <span class="badge">0</span></button></li><li><button id="tab-lead-lost" type="submit">Lost <span class="badge">0</span></button></li><li><a id="btn-add-new-dropdown" href="javascript:void(0)">Add New +</a></li></ul>
<table><thead><tr><th>SlNo</th><th>Number <i></i></th><th>Customer Name <i></i></th><th>Phone</th><th>Business Value</th><th>Lead Source</th><th>Date Added</th><th>Assignee</th></tr></thead><tbody></tbody></table>
<div><span id="showing"></span> <select id="page_size"><option>10</option><option>25</option><option>50</option><option>100</option></select>
<ul class="pagination" style="display:inline-flex;list-style:none"><li class="active"><a>1</a></li><li><a>2</a></li><li><a>next</a></li><li><a>last</a></li></ul></div></div>`, LIST_JS('leads', 8)),
  '/followups': () => SHELL('Followups', `${FILTER.replace('btn-view-A', 'btn-view-list').replace('View A', 'List View')}<button id="btn-view-kanban" type="button" style="position:absolute;right:420px;top:94px">Kanban View</button>
<div class="card"><ul id="myTab1"><li><button id="tab-followup-today" type="submit" class="active">Today's <span class="badge">0</span></button></li><li><button id="tab-followup-overdue" type="submit">Delayed <span class="badge">0</span></button></li><li><button id="tab-followup-upcoming" type="submit">Upcoming <span class="badge">0</span></button></li><li><button id="tab-followup-nonfollowup" type="submit">Non Followup <span class="badge">0</span></button></li><li><a id="btn-add-new-dropdown" href="javascript:void(0)">Add New +</a></li></ul>
<table><thead><tr><th></th><th>S.No</th><th>Next Followup Date</th><th>Action</th><th>Number</th><th>Customer Name</th><th>Phone</th><th>Lead Quality</th><th>Status</th><th>Assignee</th><th>Last Followup Date</th><th>Followup By</th></tr></thead><tbody></tbody></table>
<div><span id="showing"></span> <select id="page_size"><option>10</option><option>100</option></select></div></div>${MODAL}`, LIST_JS('followups', 12)),
  overview: (id) => SHELL('Enquiry Overview', `<div class="card"><div>Enquiry No : <span>#ENQ-999</span>
<button id="btn-add-followup" type="button">Followup <i class="ri-chat"></i></button>
<span class="dropdown"><a id="btn-enquiry-actions" href="javascript:void(0)" onclick="this.nextElementSibling.classList.toggle('show')">...</a>
<div class="dropdown-menu"><a class="dropdown-item" id="btn-edit-enquiry" href="javascript:void(0)" onclick="api('/api/update-enquiry')">Edit Enquiry</a><a class="dropdown-item" href="javascript:void(0)" onclick="api('/api/transfer-branch')">Transfer To Branch</a><a class="dropdown-item" href="javascript:void(0)">Merge Duplicate</a><a class="dropdown-item" id="btn-create-quotation" href="javascript:void(0)">Create Quotation</a></div></span></div>
<ul class="nav nav-tabs" role="tablist"><li><a class="nav-link active" role="tab" id="details-tab" aria-selected="true" data-bs-target="#details">Enquiry Details</a></li><li><a class="nav-link" role="tab" id="followups-tab" data-bs-target="#followups">Followup History</a></li><li><a class="nav-link" role="tab" id="assignment-tab" data-bs-target="#assignment">Assignment History</a></li></ul>
<div class="tab-pane active" id="details"><p>Enquiry Details :</p><p>Date : 29/09/2026</p><p>Status : In FollowUp</p><p>Lead Quality : Cold</p><p>Lead Source : Website</p><p>Added By : Mock Staffname</p>
<p>Customer Details :</p><p>Demo Customer</p><p>Phone : +91 9876512340</p><p>Assignee : Mock Staffname</p><p>Next Followup Date : 30/09/2026 10:00 AM</p>
<table><thead><tr><th>ITEM NAME</th><th>QUANTITY</th></tr></thead><tbody><tr><td>Inverter</td><td>1.00</td></tr></tbody></table><div style="height:900px"></div><p>Bottom : marker</p></div>
<div class="tab-pane" id="followups"><ul><li class="crm-recent-activity-content">Interested - Follow up about inverter installation timeline - 29 Sept 2026</li></ul></div>
<div class="tab-pane" id="assignment"><ul><li>Created by Mock Staffname and assigned to Mock Staffname</li></ul></div></div>${MODAL}`,
  `$$('[role="tab"]').forEach(t=>t.addEventListener('click',()=>{ $$('[role="tab"]').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-selected');}); t.classList.add('active'); t.setAttribute('aria-selected','true'); $$('.tab-pane').forEach(p=>p.classList.remove('active')); $(t.dataset.bsTarget).classList.add('active'); }));
$('#btn-add-followup').addEventListener('click',()=>$('#followupModal').classList.add('show'));`),
};

const DATA = {
  leads: { 'tab-lead-new': [['436', 'Mock Person A', '+919000000001'], ['481', 'Mock Person B', '+919000000002']], 'tab-lead-infollowup': [['484', 'Demo Customer', '+919876512340', '534528'], ['470', 'Mock Person C', '+919000000003']], 'tab-lead-won': [], 'tab-lead-lost': [] },
  followups: { 'tab-followup-today': [['470', 'Mock Person C', '+919000000003', '510182']], 'tab-followup-overdue': [], 'tab-followup-upcoming': [['484', 'Demo Customer', '+919876512340', '534528']], 'tab-followup-nonfollowup': [] },
};

function start(port = 0) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method !== 'GET') calls.push({ method: req.method, path: url.pathname, write: /save|delete|update|transfer|create/i.test(url.pathname) });
      const m = url.pathname.match(/^\/api\/(leads|followups)\/get-paged$/);
      if (m) {
        const q = JSON.parse(body || '{}'); const set = DATA[m[1]]; const ids = Object.keys(set); const active = q.tab || ids[0];
        const f = (rows) => rows.filter((r) => !q.term || r.join(' ').toLowerCase().includes(String(q.term).toLowerCase()));
        const rows = f(set[active]).map((r, i) => (m[1] === 'leads'
          ? [`<td data-id="${r[3] || '1'}">${i + 1}</td>`, `<td class="go">ENQ-${r[0]}</td>`, `<td class="go">${r[1]}</td>`, `<td>${r[2]}</td>`, '<td>0</td>', '<td>Website</td>', '<td>29/09/2026</td>', '<td>Mock Staffname</td>']
          : [`<td data-id="${r[3]}"><button type="submit" id="btn-view-overview-${r[3]}"><i class="ri-play-line"></i></button></td>`, `<td>${i + 1}</td>`, '<td>30/09/2026 10:00 am</td>', `<td><a id="btn-followup-${r[3]}" href="javascript:void(0)">Followup</a> <a id="btn-edit-followup-${r[3]}" href="javascript:void(0)" onclick="api('/api/update-followup')"><i class="ri-pencil"></i></a></td>`, `<td>ENQ-${r[0]}</td>`, `<td>${r[1]}</td>`, `<td>${r[2]}</td>`, '<td>Cold</td>', '<td>Interested</td>', '<td>Mock Staffname</td>', '<td></td>', '<td>Mock Staffname</td>']));
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ active, tabs: ids.map((id) => ({ id, count: f(set[id]).length })), rows, total: rows.length }));
      }
      if (url.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
      const ov = url.pathname.match(/^\/enquiry-overview\/(\d+)$/);
      const html = ov ? PAGES.overview(ov[1]) : PAGES[url.pathname] ? PAGES[url.pathname]() : null;
      if (!html) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, calls, url: 'http://127.0.0.1:' + server.address().port })));
}
module.exports = { start };
