'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  const login = new LoginPage(p);
  try {
    await login.login(C.company, C.username, C.password);
    await p.waitForTimeout(2500);
    // Walk the sidebar nav DOM (hidden submenus included) and print the tree
    const tree = await p.evaluate(() => {
      const nav = document.querySelector('aside, .app-sidebar, .main-sidebar, nav') || document.body;
      const top = [...nav.querySelectorAll('li')].filter(li => li.parentElement.closest('li') === null || !nav.contains(li.parentElement.closest('li')));
      const out = [];
      const walk = (li, depth) => {
        const label = (li.querySelector(':scope > a, :scope > span, :scope > .side-menu__item')?.textContent || '').replace(/\s+/g, ' ').trim();
        const href = li.querySelector(':scope > a')?.getAttribute('href') || '';
        if (label) out.push(`${'  '.repeat(depth)}${label}  ${href && href !== 'javascript:void(0);' ? '-> /' + href : ''}`);
        const sub = li.querySelector(':scope > ul');
        if (sub) [...sub.children].filter(c => c.tagName === 'LI').forEach(c => walk(c, depth + 1));
      };
      top.forEach(li => walk(li, 0));
      return out.join('\n');
    });
    console.log(tree);
  } catch (e) { console.log('ERR:', e.message); } finally { await b.close(); }
})();
