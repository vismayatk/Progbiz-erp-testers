'use strict';
/**
 * Backend-error scenario runner.
 * Repeatedly exercises the operations that intermittently fail after the recent
 * backend change, and reports a success/failure rate with the exact error
 * messages/codes. Evidence for the backend team.
 *
 *   Trial A — Lead Transfer "Apply Filters"  (expects ExpectedStartOfValueNotFound)
 *   Trial B — New Customer save on the Enquiry form (expects "Oops … Error Code …")
 */
require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');
const BASE='https://erptest.progbiz.in', CO='lesol_test', USER='admin', PASS='123';
const ITER = Number(process.env.ITER || 5);
const log=(...a)=>console.log(...a);
const SHOTS='backend_err_shots'; if(!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

const results = [];

async function swalText(p){
  const s=p.locator('.swal2-popup');
  if(await s.isVisible().catch(()=>false)) return (await p.locator('.swal2-title,.swal2-html-container').allTextContents().catch(()=>[])).join(' ').replace(/\s+/g,' ').trim();
  return null;
}
async function dismissSwal(p){ const c=p.locator('.swal2-confirm'); if(await c.isVisible().catch(()=>false)){ await c.click().catch(()=>{}); await p.waitForTimeout(400);} }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport:{width:1366,height:1000} });
  p.setDefaultTimeout(20000);
  p.on('dialog', async d=>{ await d.accept().catch(()=>{}); });
  await login(p);
  log(`\n🔁 Running backend-error scenario × ${ITER} iterations\n`);

  for(let i=1;i<=ITER;i++){
    // ── Trial A: Lead Transfer Apply Filters ─────────────────────────────
    try{
      await p.goto(`${BASE}/bulk-lead-transfer`,{waitUntil:'domcontentloaded'});
      await p.waitForTimeout(1500); await dismissSwal(p);
      await p.locator('button',{hasText:/apply filter/i}).first().click({timeout:8000}).catch(()=>{});
      await p.waitForTimeout(3000);
      const err = await swalText(p);
      const rows = await p.locator('table tbody tr').count().catch(()=>0);
      const ok = !err && rows>0;
      if(err){ await p.screenshot({path:`${SHOTS}/A_iter${i}_err.png`}); await dismissSwal(p); }
      results.push({iter:i, op:'LeadTransfer ApplyFilters', ok, rows, error:err});
      log(`A#${i} ApplyFilters: ${ok?'OK ('+rows+' rows)':'ERROR'} ${err?'-> '+err.slice(0,90):''}`);
    }catch(e){ results.push({iter:i, op:'LeadTransfer ApplyFilters', ok:false, error:e.message}); log(`A#${i} EXC ${e.message.slice(0,60)}`);}

    // ── Trial B: New Customer save (Enquiry form) ────────────────────────
    try{
      const ts=Date.now()+i;
      await p.goto(`${BASE}/enquiry`,{waitUntil:'domcontentloaded'});
      await p.locator('#btn-save-enquiry').waitFor({state:'visible',timeout:20000});
      await p.locator('#customer-phone').fill('9'+String(ts).slice(-9));
      const grp=p.locator('#customer-phone').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
      if(!(await p.locator('#enquiry-new-customer-modal').isVisible().catch(()=>false))) await grp.locator('i.ri-add-fill').first().click().catch(()=>{});
      const m=p.locator('#enquiry-new-customer-modal'); await m.waitFor({state:'visible',timeout:10000});
      await m.locator('input[placeholder="please enter name"]:visible').first().fill(`BE Test ${ts}`);
      await m.locator('input[placeholder="please enter email address"]:visible').first().fill(`be${ts}@example.com`).catch(()=>{});
      await p.locator('#btn-customer-save:visible').first().click();
      await p.waitForTimeout(2500);
      const err = await swalText(p);
      const isErr = err && /oops|something went wrong|error code|failed/i.test(err);
      if(isErr){ await p.screenshot({path:`${SHOTS}/B_iter${i}_err.png`}); }
      await dismissSwal(p);
      results.push({iter:i, op:'NewCustomer Save', ok:!isErr, error:isErr?err:null});
      log(`B#${i} NewCustomerSave: ${isErr?'ERROR -> '+err.slice(0,90):'OK'}`);
    }catch(e){ results.push({iter:i, op:'NewCustomer Save', ok:false, error:e.message}); log(`B#${i} EXC ${e.message.slice(0,60)}`);}
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log('\n══════════ SUMMARY ══════════');
  for(const op of ['LeadTransfer ApplyFilters','NewCustomer Save']){
    const t=results.filter(r=>r.op===op);
    const fail=t.filter(r=>!r.ok);
    log(`${op}: ${t.length-fail.length}/${t.length} ok, ${fail.length} FAILED`);
    const codes=[...new Set(fail.map(r=>(String(r.error).match(/Error Code:\s*\w+/i)||[])[0]||(String(r.error).match(/ExpectedStartOfValueNotFound/i)||[])[0]||(r.error||'').slice(0,40)).filter(Boolean))];
    if(codes.length) log(`   error signatures: ${JSON.stringify(codes)}`);
  }
  fs.writeFileSync('backend_error_report.json', JSON.stringify(results,null,2));
  log('\n📄 backend_error_report.json  |  📸', SHOTS+'/');
  await browser.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});

async function login(p){
  for(let attempt=1;attempt<=3;attempt++){
    try{
      await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
      const co=p.locator('input[name="company_code"], input[id*="company" i]').first();
      await co.waitFor({state:'visible',timeout:40000});
      await co.fill(CO);
      await p.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
      await p.locator('input[type="password"]').first().fill(PASS);
      await p.locator('button[type="submit"]').first().click();
      await p.waitForFunction(()=>!location.href.includes('/login'),{timeout:30000});
      return;
    }catch(e){ log(`login attempt ${attempt} failed: ${e.message.slice(0,50)}`); if(attempt===3) throw e; await p.waitForTimeout(3000); }
  }
}
