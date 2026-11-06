import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ baseURL: 'http://127.0.0.1:3009', viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
 await page.goto('/');
 await page.getByRole('link', { name: 'Sign in with GitHub', exact: true }).click();
 await page.getByRole('link', { name: 'Authorize Alice', exact: true }).click();
 await page.locator('.boards-list, #board-heading').first().waitFor();
 if (await page.getByRole('button', { name: 'Boards ▾', exact: true }).isVisible()) await page.getByRole('button', { name: 'Boards ▾', exact: true }).click();
 await page.getByLabel('Board name', { exact: true }).fill('Desktop final check');
 await page.getByRole('button', { name: 'Create board', exact: true }).click();
 for (const [trigger, focus] of [['Board settings', 'Board name'], ['Boards ▾', 'Board name']]) {
  await page.getByRole('button', { name: trigger, exact: true }).click();
  await expect(page.getByLabel(focus, { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: trigger, exact: true })).toBeFocused();
 }
 await page.getByRole('button', { name: 'Repositories', exact: true }).click();
 await page.getByLabel('Search repositories').fill('alice/project');
 await page.getByRole('button', { name: /alice\/project/ }).first().click();
 await page.getByLabel('State', { exact: true }).selectOption('all');
 await page.getByRole('button', { name: 'Connect repository', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Add all matching', exact: true })).toBeEnabled();
 await page.getByRole('button', { name: /^Find/ }).click();
 await expect(page.getByRole('region', { name: 'Find cards', exact: true })).toBeVisible();
 await expect(page.locator('#incoming-panel')).toHaveCount(0);
 await page.getByRole('button', { name: /^Incoming/ }).click();
 await page.getByRole('button', { name: 'Add all matching', exact: true }).click();
 await expect(page.locator('.workspace-card')).toHaveCount(5);
 await page.getByRole('button', { name: 'Close Incoming' }).click();
 await page.getByRole('button', { name: 'View', exact: true }).click();
 await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Delivery' });
 await page.getByLabel('Connections', { exact: true }).selectOption('all');
 await page.getByRole('button', { name: 'Close View' }).click();
 await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
 for (const theme of ['light', 'dark']) {
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  await page.screenshot({ path: `.scratch/desktop-redesign/evidence/final-${theme}.png` });
 }
 await page.getByRole('button', { name: /^Incoming/ }).click();
 for (const [width,height,font] of [[1440,900,100],[1280,800,200],[640,450,100],[320,800,200],[320,568,100]]) {
  await page.setViewportSize({ width,height });
  await page.evaluate(font => document.documentElement.style.fontSize=`${font}%`, font);
  const footer=page.getByRole('button', {name:'Add all matching',exact:true});
  await footer.scrollIntoViewIfNeeded();
  const check=await footer.evaluate(e=>{const r=e.getBoundingClientRect(); return {rect:[r.x,r.y,r.width,r.height],reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),at:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,180)};});
  console.log({width,height,font,...check,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 }
 console.log({errors});
} finally { await browser.close(); }
