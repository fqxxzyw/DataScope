import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
test('ContextMap is an integrated local NLP workspace', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '文本语义探索', exact: true }).click();
  await page.getByRole('button', { name: '酒店评论', exact: true }).click();
  await expect(page.locator('.cm-stats')).toContainText('6 documents');
  await expect(page.locator('.cm-stats')).toContainText('tokens');
  mkdirSync('docs/contextmap', { recursive: true });
  const shot = async (name: string) => {
    await page.locator('.cm-header').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/contextmap/${name}.png`, fullPage: true });
  };
  const tab = async (name: string) => {
    await page
      .getByRole('navigation', { name: 'ContextMap 视图' })
      .getByRole('button', { name, exact: true })
      .click();
  };
  await shot('overview');
  await tab('Pipeline');
  await expect(page.locator('.cm-inspector')).toContainText('Raw');
  await page.getByText('Analysis Settings · 分析设置（修改后自动重算）', { exact: true }).click();
  await page.getByLabel('Remove Punctuation', { exact: true }).uncheck();
  await expect(page.locator('.cm-inspector')).toContainText('Remove Punctuation （OFF');
  await expect(page.locator('.cm-inspector')).toContainText('酒店的位置很好，房间非常干净。');
  await page.getByLabel('Remove Punctuation', { exact: true }).check();
  await expect(page.locator('.cm-inspector')).not.toContainText('Remove Punctuation （OFF');
  await page.getByText('Analysis Settings · 分析设置（修改后自动重算）', { exact: true }).click();
  await shot('pipeline');
  await tab('Tokens');
  await expect(page.locator('.cm-view')).toContainText('酒店');
  await page.getByLabel('Show Stop Words', { exact: true }).check();
  await tab('Frequency');
  await page.getByLabel('Top Words', { exact: true }).selectOption('50');
  await expect(page.locator('.cm-stats')).toContainText('6 documents');
  await page
    .locator('.cm-chips button')
    .filter({ hasText: /^酒店 ·/ })
    .click();
  await expect(page.locator('.cm-word-detail')).toContainText('Document Frequency');
  await shot('frequency');
  await tab('N-Gram');
  await page.getByLabel('N-Gram', { exact: true }).selectOption('3');
  await expect(page.locator('.cm-sliding')).toBeVisible();
  await page.getByRole('button', { name: '向右移动一步' }).click();
  await shot('ngram');
  await tab('TF-IDF');
  await expect(page.locator('.cm-formula')).toContainText('IDF = ln');
  await shot('tfidf');
  await tab('Co-occurrence');
  await page.getByLabel('Co-occurrence Window', { exact: true }).selectOption('3');
  await expect(page.getByRole('img', { name: 'Co-occurrence Matrix' })).toBeVisible();
  await page.getByRole('button', { name: '显示 Word Network' }).click();
  await expect(page.locator('.cm-network circle').first()).toBeVisible();
  const node = page.locator('.cm-network g[role=button]').first();
  await node.click();
  await expect(page.locator('.cm-network circle[fill="#db8353"]').first()).toBeVisible();
  const box = await node.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 40, { steps: 4 });
    await page.mouse.up();
  }
  await shot('word-network');
  await tab('Vector');
  await expect(page.locator('.cm-view')).toContainText('完整词表');
  await tab('Similarity');
  await page.getByRole('button', { name: '生成 Similarity Matrix' }).click();
  await expect(page.getByRole('img', { name: 'Similarity Matrix' })).toBeVisible();
  await shot('similarity');
  await tab('Label Compare');
  await expect(page.locator('.cm-compare')).toContainText('positive');
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'frequency CSV', exact: true }).click();
  const csv = await csvEvent;
  expect(csv.suggestedFilename()).toBe('word-frequency.csv');
  const csvPath = await csv.path();
  expect(readFileSync(csvPath!, 'utf8')).toContain('"word","count","document_frequency"');
  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Analysis JSON', exact: true }).click();
  const json = await jsonEvent;
  const data = JSON.parse(readFileSync((await json.path())!, 'utf8'));
  expect(data.source).toBeUndefined();
  expect(data.documents).toBe(6);
  await page.getByRole('button', { name: '打开 / 粘贴文本', exact: true }).click();
  await page
    .getByLabel('ContextMap 文件', { exact: true })
    .setInputFiles({
      name: 'labels.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('text,label\n"clean hotel",positive\n"dirty room",negative'),
    });
  await expect(page.getByRole('heading', { name: '原始数据 · labels.csv' })).toBeVisible();
  await page.getByLabel('Label Column', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '使用所选字段分析' }).click();
  await expect(page.locator('.cm-stats')).toContainText('2 documents');
  await tab('Label Compare');
  await expect(page.locator('.cm-compare')).toContainText('negative');
  // The existing DataScope theme control persists across module reloads.
  const theme = page.getByRole('button', { name: /切换.*主题|切换深色|切换浅色/ }).first();
  if (await theme.count()) await theme.click();
  else await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot('dark-mode');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});
