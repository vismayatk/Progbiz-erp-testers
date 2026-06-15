'use strict';
/** End-to-end Lead Transfer test (robust):
 *  A) /bulk-lead-transfer: Apply -> capture first lead row {number,name,phone}
 *  B) /leads: search phone -> current assignee A; pick target E != A
 *  C) /bulk-lead-transfer: Apply -> select that row -> Transfer To=E -> confirm
 *  D) /leads: search phone -> assignee should == E */
require('dotenv').config();
const { chromium } = require('playwright');
const BASE='https://erptest.progbiz.in', CO='lesol_test', USER='admin', PASS='123';
const log=(...a)=>console.log(...a);
const EXECS=['VIGNESH','SHAMAL','JASEEM','Biju','Arshida','Shaju Ummar'];
const norm=s=>(s||'').replace(/\D/g,'');

async function swalText(p){
  const s=p.locator('.swal2-popup');
  if(await s.isVisible().catch(()=>false)) return (await p.locator('.swal2-title,.swal2-html-container').allTextContents().catch(()=>[])).join(' ').trim();
  return null;
}
async function swalConfirm(p){ const c=p.locator('.swal2-confirm'); if(await c.isVisible().catch(()=>false)){ await c.click().catch(()=>{}); return true;} return false; }

async function applyFilters(p){
  let rows=0;
  for(let i=0;i<4 && rows===0;i++){
    if(await swalText(p)) await swalConfirm(p);
    await p.locator('button',{hasText:/apply filter/i}).first().click({timeout:8000}).catch(()=>{});
    await p.waitForTimeout(3000);
    const err=await swalText(p); if(err) await swalConfirm(p);
    rows=await p.locator('table tbody tr').count().catch(()=>0);
    log(`   apply attempt ${i+1}: rows=${rows}${err?` err=${JSON.stringify(err).slice(0,70)}`:''}`);
  }
  return rows;
}

async function leadsAssignee(p, phone){
  await p.goto(`${BASE}/leads`,{waitUntil:'domcontentloaded'});
  await p.locator('table tbody tr').first().waitFor({state:'visible',timeout:15000}).catch(()=>{});
  await p.waitForTimeout(1000);
  await p.locator('#filter-name').fill(phone).catch(()=>{});
  await p.waitForTimeout(2500);
  return p.evaluate((ph)=>{
    const norm=s=>(s||'').replace(/\D/g,'');
    for(const r of document.querySelectorAll('table tbody tr')){
      const c=[...r.querySelectorAll('td')].map(e=>(e.textContent||'').trim());
      if(c.some(x=>norm(x).includes(norm(ph).slice(-10)))) return {assignee:c[c.length-1], cells:c};
    }
    return null;
  }, phone);
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport:{width:1366,height:1000} });
  p.setDefaultTimeout(20000);
  p.on('dialog', async d => { await d.accept().catch(()=>{}); });
  await login(p);

  // A) transfer page first row
  await p.goto(`${BASE}/bulk-lead-transfer`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2000); if(await swalText(p)) await swalConfirm(p);
  if(await applyFilters(p)===0){ log('A) could not load leads (backend)'); await b.close(); return; }
  const headers = await p.evaluate(()=>[...document.querySelectorAll('table thead th')].map(t=>(t.textContent||'').trim()));
  log('A) headers =', JSON.stringify(headers));
  const first = await p.evaluate(()=>{
    const r=document.querySelector('table tbody tr'); const c=[...r.querySelectorAll('td')].map(e=>(e.textContent||'').trim());
    return {number:c[2], name:c[3], phone:(c[4]||'').replace(/\D/g,'').slice(-10), assignee:c[c.length-1], all:c};
  });
  log('A) transfer first row =', JSON.stringify(first));
  const A = first.assignee||'';
  const target = EXECS.find(e=>e.toLowerCase()!==A.toLowerCase())||'VIGNESH';
  log('   current assignee =', A, '| target =', target);

  // C) select that row, choose target, transfer
  const row = p.locator('table tbody tr').first();
  await row.locator('input[type=checkbox]').check().catch(()=>row.locator('input[type=checkbox]').click().catch(()=>{}));
  await p.waitForTimeout(800);
  const execSel = p.locator('select').filter({ has: p.locator('option',{hasText:/Select Executive/i}) }).first();
  await execSel.selectOption({label:target}).catch(e=>log('exec sel err',e.message.slice(0,40)));
  await p.screenshot({path:'lt_before.png', fullPage:true});
  await p.locator('button',{hasText:/transfer selected/i}).first().click().catch(e=>log('transfer click err',e.message.slice(0,40)));
  await p.waitForTimeout(1800);
  const confirmTxt = await swalText(p); await swalConfirm(p);   // "Are you sure ..."
  // wait for the result swal (success or backend error)
  let resultTxt=null;
  for(let i=0;i<6 && !resultTxt;i++){ await p.waitForTimeout(1200); resultTxt=await swalText(p); }
  await swalConfirm(p);
  log('C) confirm =', JSON.stringify(confirmTxt), '| result =', JSON.stringify(resultTxt));
  await p.screenshot({path:'lt_result.png', fullPage:true});

  // D) verify via transfer table assignee column: re-apply, find lead by phone, read assignee
  await p.waitForTimeout(1500);
  await applyFilters(p);
  const after = await p.evaluate((ph)=>{
    const norm=s=>(s||'').replace(/\D/g,'');
    for(const r of document.querySelectorAll('table tbody tr')){
      const c=[...r.querySelectorAll('td')].map(e=>(e.textContent||'').trim());
      if(c.some(x=>norm(x).includes(ph.slice(-10)))) return {assignee:c[c.length-1], cells:c};
    }
    return null;
  }, first.phone);
  log('D) after transfer, transfer-table row =', JSON.stringify(after));
  const ok = after && (after.assignee||'').toLowerCase().includes(target.toLowerCase());
  log(`\nVERDICT: lead ${first.number} (${first.phone}) "${A}" -> target "${target}" => actual "${after&&after.assignee}" : ${ok?'PASS ✅':'FAIL/CHECK ❌'}`);

  await b.close(); log('DONE');
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});

async function login(p){
  await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
  await p.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await p.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForFunction(()=>!location.href.includes('/login'),{timeout:25000});
}
