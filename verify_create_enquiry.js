'use strict';
/**
 * Standalone, verbose verification of the full Create-Enquiry flow on lesol_test.
 * Headless, step-by-step logging, screenshots at each stage. Independent of the
 * Playwright test harness (whose console output gets truncated).
 */
require('dotenv').config();
const { chromium } = require('playwright');
const BASE='https://erptest.progbiz.in', CO='lesol_test', USER='admin', PASS='123';
const ts = Date.now();
const NAME = `Test Customer ${ts}`;
const PHONE = String(9000000000 + (ts % 999999999)).slice(0, 10);
const log = (...a) => console.log(...a);

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport:{width:1366,height:1000} });
  p.setDefaultTimeout(20000);
  p.on('dialog', async d => { log('   [dialog]', d.message()); await d.accept().catch(()=>{}); });

  // login
  await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
  await p.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await p.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForFunction(()=>!location.href.includes('/login'),{timeout:25000});
  log('1. logged in');

  // open enquiry form
  await p.goto(`${BASE}/enquiry`,{waitUntil:'domcontentloaded'});
  await p.locator('#btn-save-enquiry').waitFor({state:'visible',timeout:20000});
  await p.locator('#TxtCustomer').waitFor({state:'visible',timeout:20000});
  log('2. enquiry form ready');

  // branch (required)
  await selectFirstReal(p.locator('#branch'), 'Branch');

  // phone -> triggers New Customer modal
  await p.locator('#customer-phone').fill(PHONE);
  log(`3. phone "${PHONE}" entered`);

  const modal = p.locator('#enquiry-new-customer-modal');
  // Deterministically open via the "+" next to the phone
  if (!(await modal.isVisible().catch(()=>false))) {
    const grp = p.locator('#customer-phone').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await grp.locator('i.ri-add-fill').first().click({timeout:8000}).catch(()=>{});
  }
  const modalAppeared = await modal.waitFor({state:'visible',timeout:10000}).then(()=>true).catch(()=>false);
  log('4. new-customer modal visible:', modalAppeared);

  if (modalAppeared) {
    await p.screenshot({path:'verify_01_modal.png'});
    const nameField = modal.locator('input[placeholder="please enter name"]:visible').first();
    await nameField.fill(NAME);
    log('   modal: name filled =', await nameField.inputValue());
    await p.locator('#btn-customer-save:visible').first().click();
    log('5. modal Save (#btn-customer-save) clicked');
    await modal.waitFor({state:'hidden',timeout:12000}).then(()=>log('   modal closed')).catch(()=>log('   modal did NOT hide'));
    await p.waitForTimeout(1200);
  }

  log('   main #TxtCustomer value =', await p.locator('#TxtCustomer').inputValue().catch(()=>'(n/a)'));
  await p.screenshot({path:'verify_02_after_modal.png'});

  // assign to (required)
  await selectFirstReal(p.locator('#assignto'), 'Assign To');
  // lead source
  await selectFirstReal(p.locator('#leadsource'), 'Lead Source');
  // business value + remarks
  await p.locator('#business-value').fill('1000').catch(()=>{});
  await p.locator('#enquiry-description').fill(`auto ${ts}`).catch(()=>{});

  // add item via #searchItemModal
  await addItem(p, 'Inverter', '1');
  await p.screenshot({path:'verify_03_after_item.png'});

  // not-required followup
  try { const c=p.locator('#no-next-followup-enquiry'); if(await c.count()&&!(await c.isChecked())) await c.check(); } catch {}

  // save enquiry
  await p.locator('#btn-save-enquiry').click();
  log('6. enquiry Save clicked');
  await p.waitForTimeout(2500);

  const toast = await firstText(p, ['.toast-message','.toast-success','.alert','.swal2-html-container','.swal2-title']);
  log('7. toast/alert =', JSON.stringify(toast));
  log('   final url =', p.url());
  await p.screenshot({path:'verify_04_after_save.png', fullPage:true});

  await b.close();
  log('DONE');
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

async function selectFirstReal(loc, label){
  try{
    await loc.waitFor({state:'visible',timeout:6000});
    const v = await loc.evaluate(sel=>{const o=[...sel.options].find(o=>o.value&&!/^(choose|choose level|select|you)?$/i.test(o.text.trim())&&o.value!=='0');return o?o.value:(sel.options[1]?sel.options[1].value:'');});
    if(v){await loc.selectOption(v); log(`   ${label} selected`);}
  }catch{ log(`   ${label} not found`); }
}

async function addItem(p, name, qty){
  try{
    await p.locator('#item-search-input').scrollIntoViewIfNeeded();
    const itemGrp = p.locator('#item-search-input').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await itemGrp.locator('i.ri-search-line').first().click({timeout:8000});
    const m = p.locator('#searchItemModal');
    await m.waitFor({state:'visible',timeout:10000});
    await p.locator('#item-search-modal-input').fill(name);
    await m.locator('i.ri-search-line').first().click().catch(()=>{});
    const row = m.locator('table tbody tr').first();
    await row.waitFor({state:'visible',timeout:10000});
    log('   item modal: result row =', (await row.textContent()||'').replace(/\s+/g,' ').trim().slice(0,60));
    const rb = row.locator('button, a, i.ri-add-fill').first();
    if(await rb.count()) await rb.click(); else await row.click();
    if(await m.isVisible().catch(()=>false)) await m.locator('.btn-close').first().click().catch(()=>{});
    await p.waitForTimeout(800);
    await p.locator('#new-item-quantity').fill(String(qty)).catch(()=>{});
    log('   item added');
  }catch(e){ log('   addItem failed:', e.message); }
}

async function firstText(p, sels){
  for(const s of sels){ try{ const l=p.locator(s).first(); await l.waitFor({state:'visible',timeout:3000}); return (await l.textContent()).trim(); }catch{} }
  return null;
}
