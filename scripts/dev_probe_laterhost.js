'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage();
  p.on('request', r => { if (r.method()==='POST' && /save-task/i.test(r.url()) && r.postData()) { const j=JSON.parse(r.postData()); console.log('SAVE party:', j.partyEntityID, '| assignees:', (j.assigneeList||[]).map(a=>a.label).slice(0,3).join(',')+'...'); } });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'LHProbe ' + Date.now();
    await tm.openTaskModal();
    await tm.selectMode('later');
    await tm.branchSelect.evaluate(s => { if (!s.value) s.selectedIndex = 0; }).catch(()=>{});
    await tm.taskTypeSelect.selectOption({ label: 'Activities' }).catch(()=>{});
    await tm.taskInput.fill(name);
    await tm.ensureSelfHost();   // add admin as host (no party)
    const d = new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    await p.$eval('#instantDeadlineToggle', el => { if(!el.checked) el.click(); }).catch(()=>{});
    await p.waitForTimeout(700);
    const dIns = p.locator('input[type="date"]:visible'); for (let i=0;i<await dIns.count();i++){await dIns.nth(i).fill(d).catch(()=>{});await dIns.nth(i).blur().catch(()=>{});}
    const tIns = p.locator('input[type="time"]:visible'); for (let i=0;i<await tIns.count();i++){await tIns.nth(i).fill('10:00').catch(()=>{});await tIns.nth(i).blur().catch(()=>{});}
    await p.waitForTimeout(600);
    await tm.saveBtn.click(); await p.waitForTimeout(2500);
    console.log('save msg:', await tm._afterSave());
    // find in my-tasks
    let found=null; await tm.gotoMyTasks(); await p.waitForTimeout(3000);
    for (const tab of ['Today','Upcoming','Unscheduled','Delayed','Completed']) { await tm.clickTab(tab); await p.waitForTimeout(1200); if (await p.evaluate(n=>[...document.querySelectorAll('table tbody tr')].some(r=>(r.textContent||'').includes(n)),name)) {found=tab;break;} }
    console.log('found in my-tasks tab:', found);
    console.log('openTaskDetails →', await tm.openTaskDetails(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
