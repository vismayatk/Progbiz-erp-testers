'use strict';
/** Dashboard data-integrity (Task A): Σ(executive table column) vs Leads-Summary
 *  badge, for a given Branch/Executive/Period filter. Prints a reconciliation. */
require('dotenv').config();
const { chromium } = require('playwright');
const BASE='https://erptest.progbiz.in', CO='lesol_test', USER='admin', PASS='123';
const log=(...a)=>console.log(...a);
const num=s=>{ const m=String(s).replace(/[, ]/g,'').match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):0; };

async function waitDashboard(p){
  await p.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});
  for(let i=0;i<20;i++){
    const ready=await p.evaluate(()=>/Total\s*\d/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length>0);
    if(ready) return true;
    await p.waitForTimeout(2000);
  }
  return false;
}

async function extract(p){
  return p.evaluate(()=>{
    const txt=el=>(el.textContent||'').replace(/\s+/g,' ').trim();
    // Executive table — use the LEAF header row (last thead tr) so columns align
    const t=document.querySelector('table');
    const headRows=[...t.querySelectorAll('thead tr')];
    const headers=headRows.length? [...headRows[headRows.length-1].querySelectorAll('th')].map(txt) : [];
    const rows=[...t.querySelectorAll('tbody tr')].map(r=>[...r.querySelectorAll('td')].map(txt));
    const foot=[...t.querySelectorAll('tfoot tr')].map(r=>[...r.querySelectorAll('td,th')].map(txt));
    // Leads Summary badges: find elements "Status <num>" for each status word
    const statuses=['Total','Won','Lost','New','Not Connected','Not Reachable','Cold','Warm','Hot'];
    const badges={};
    for(const s of statuses){
      // match an element whose trimmed text starts with the status then a number
      const re=new RegExp('^'+s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\s+([\\d,]+)','i');
      let best=null;
      document.querySelectorAll('div,span,li,td,p,h1,h2,h3,h4,h5,h6,strong,b').forEach(el=>{
        if(el.getClientRects().length===0) return;
        const m=txt(el).match(re);
        if(m && (best===null || txt(el).length<best.len)) best={val:m[1], len:txt(el).length};
      });
      if(best) badges[s]=best.val;
    }
    return {headers, rows, foot, badges};
  });
}

async function applyCombo(p, branch, exec, month){
  // open the filter panel if a toggle exists
  const toggle=p.locator('#btn-toggle-filter');
  if(await toggle.isVisible().catch(()=>false)) { await toggle.click().catch(()=>{}); await p.waitForTimeout(600); }
  // set each select by visible label and fire a real change event (selectOption alone
  // doesn't always trigger the dashboard's handler)
  await p.evaluate(({branch,exec,month})=>{
    const set=(id,label)=>{ const s=document.querySelector(id); if(!s) return; const o=[...s.options].find(o=>o.text.trim().toLowerCase()===label.toLowerCase()); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } };
    set('#dashboard-filter-branch',branch);
    set('#dashboard-filter-executives',exec);
    set('#dashboard-filter-month',month);
  }, {branch,exec,month});
  const apply=p.locator('#btn-apply-filter');
  if(await apply.isVisible().catch(()=>false)) await apply.click().catch(()=>{});
  await p.waitForTimeout(3000);
  await waitDashboard(p);
}

function reconcile(d){
  const colIdx={}; d.headers.forEach((h,i)=>colIdx[h.toLowerCase()]=i);
  const footRow=d.foot[0]||[];
  const sumCol=name=>{ const i=colIdx[name.toLowerCase()]; if(i==null) return null; let s=0; d.rows.forEach(r=>s+=num(r[i+1])); return s; };
  const footCol=name=>{ const i=colIdx[name.toLowerCase()]; return (i==null||footRow[i+1]==null)?null:num(footRow[i+1]); };
  const statuses=['Total','Won','Lost','New','Cold','Warm','Hot','Not Connected','Not Reachable'];
  let pass=0, fail=0; const lines=[];
  for(const s of statuses){
    if(d.badges[s]===undefined){ lines.push(`    ${s.padEnd(15)} (badge not found)`); continue; }
    const bv=num(d.badges[s]); const sv=sumCol(s); const fv=footCol(s);
    const ref=fv!=null?fv:sv; const ok=ref!=null&&bv===ref; ok?pass++:fail++;
    lines.push(`    ${s.padEnd(15)} badge=${String(bv).padStart(5)} Σexec=${String(sv==null?'-':sv).padStart(5)} footer=${String(fv==null?'-':fv).padStart(5)}  ${ok?'✅':'❌'}`);
  }
  return {pass, fail, lines};
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport:{width:1500,height:1100} });
  p.setDefaultTimeout(30000);
  await login(p);
  await p.goto(`${BASE}/crm-dashboard`,{waitUntil:'domcontentloaded'});
  await waitDashboard(p);

  const combos=[
    ['All Branch','All Executives','This Month'],
    ['All Branch','All Executives','This Week'],
    ['All Branch','Arshida','This Month'],
    ['Kannur','All Executives','This Month'],
    ['All Branch','All Executives','This Year'],
  ];
  const summary=[];
  for(const [br,ex,mo] of combos){
    await applyCombo(p, br, ex, mo);
    const d=await extract(p);
    const r=reconcile(d);
    log(`\n══ ${br} | ${ex} | ${mo} ══  (exec rows=${d.rows.length})`);
    log(`  badges: ${JSON.stringify(d.badges)}`);
    r.lines.forEach(l=>log(l));
    log(`  → ${r.pass} match, ${r.fail} mismatch`);
    summary.push({combo:`${br}|${ex}|${mo}`, pass:r.pass, fail:r.fail});
  }
  log('\n════════ SUMMARY ════════');
  summary.forEach(s=>log(`  ${s.fail===0?'✅':'❌'} ${s.combo.padEnd(40)} ${s.pass} match / ${s.fail} mismatch`));
  await p.screenshot({path:'dash_verify.png', fullPage:true});
  await b.close(); log('\nDONE');
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});

async function login(p){
  for(let a=1;a<=3;a++){ try{
    await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
    const co=p.locator('input[name="company_code"], input[id*="company" i]').first();
    await co.waitFor({state:'visible',timeout:40000}); await co.fill(CO);
    await p.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
    await p.locator('input[type="password"]').first().fill(PASS);
    await p.locator('button[type="submit"]').first().click();
    await p.waitForFunction(()=>!location.href.includes('/login'),{timeout:30000}); return;
  }catch(e){ if(a===3) throw e; await p.waitForTimeout(3000);} }
}
