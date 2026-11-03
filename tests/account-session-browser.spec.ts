import { expect, test } from 'playwright/test';
import { createProjectWorkflow } from '../src/lib/project-template';
import { createDomainNode } from '../src/lib/create-domain-node';
import { WORKFLOW_STORAGE_KEY } from './support/e2e-workflow';

test('another tab changing the account clears the previous L3 workspace before reopening', async ({ page }) => {
  const alice = { id: 'isolation-alice', email: 'alice@example.invalid', name: 'Alice' };
  const bob = { id: 'isolation-bob', email: 'bob@example.invalid', name: 'Bob' };
  let sessionUser = alice;
  const file = createProjectWorkflow('Alice private project');
  const chapter = createDomainNode('general', 'alice-private-department');
  chapter.title = 'Alice private department';
  chapter.conditions = [{ id: 'alice-private-condition', label: 'Alice confidential L3 condition' }];
  chapter.customFields = { legalDocuments: JSON.stringify([{ id: 'private', title: 'Alice secret upload', fileName: 'secret.pdf', url: '/api/files/download?key=users%2Fisolation-alice%2Flegal%2Fsecret.pdf' }]) };
  file.graph.nodes = [chapter];
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: sessionUser } }));
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: [] } }));
  await page.addInitScript(({key, file, alice}) => {
    if (sessionStorage.getItem('account-isolation-seeded')) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: alice.id, dirty: false }, version: 0 }));
    sessionStorage.setItem('account-isolation-seeded', '1');
  }, { key: WORKFLOW_STORAGE_KEY, file, alice });
  await page.goto('/release-conditions');
  await expect(page.getByText('Alice confidential L3 condition', { exact: true })).toBeVisible();
  sessionUser = bob;
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {key:'workflow:account-changed', newValue:'other-tab-login'})));
  await reloaded;
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').state?.workspaceOwnerId, WORKFLOW_STORAGE_KEY)).toBe(bob.id);
  await expect(page.getByRole('dialog', {name:'New project'})).toBeVisible();
  await expect(page.locator('h1')).toHaveText('L3 · Conditions');
  await expect(page.getByText('Alice confidential L3 condition', {exact:true})).toHaveCount(0);
  const persisted = await page.evaluate(key => localStorage.getItem(key), WORKFLOW_STORAGE_KEY);
  expect(persisted).not.toContain('secret.pdf');
  expect(persisted).not.toContain('Alice private');
});
