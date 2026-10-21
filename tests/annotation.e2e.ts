import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('annotation labels, autosave, undo, resume, exports and ID-based refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '数据标注', exact: true }).click();
  const rows = [
    { post_id: '10', title: '活动文章', content: '活动正文' },
    { post_id: '20', title: '生日文章', content: '生日正文' },
    { post_id: '30', title: '普通文章', content: '普通正文' },
  ];
  await page
    .getByLabel('标注文件', { exact: true })
    .setInputFiles({
      name: 'posts.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(rows)),
    });
  await page.getByRole('button', { name: '扫描所选数据', exact: true }).click();
  await expect(page.getByRole('heading', { name: /扫描完成/ })).toBeVisible();
  await page.getByLabel('主显示字段', { exact: true }).selectOption('title');
  await page.getByLabel('唯一 ID 字段', { exact: true }).selectOption('post_id');
  await page.getByLabel('项目名称', { exact: true }).fill('测试标注项目');
  await page.getByRole('checkbox', { name: '已核对数据、字段和本地保存方式' }).check();
  await page.getByRole('button', { name: '创建项目并开始标注' }).click();
  await page.getByRole('button', { name: '标签管理', exact: true }).click();
  await page.getByRole('button', { name: '新增标签', exact: true }).click();
  await page.getByLabel('标签名称 1', { exact: true }).fill('活动');
  await page.getByRole('button', { name: '新增标签', exact: true }).click();
  await page.getByLabel('标签名称 2', { exact: true }).fill('生日');
  await page.getByRole('button', { name: '保存标签设置' }).click();
  await expect(page.locator('.ann-label-button')).toHaveCount(2);
  await page.getByRole('button', { name: '关闭标签管理' }).click();
  await page.locator('.ann-record').click();
  await page.keyboard.press('1');
  await expect(page.locator('.ann-record h2')).toHaveText('生日文章');
  await expect(page.locator('.ann-header')).toContainText('1 / 3');
  await page.locator('.ann-record').click();
  await page.keyboard.press('Space');
  await expect(page.locator('.ann-record h2')).toHaveText('普通文章');
  await page.getByLabel('标注状态筛选', { exact: true }).selectOption('skipped');
  await expect(page.locator('.ann-record h2')).toHaveText('生日文章');
  await expect(page.locator('.ann-record')).toContainText('已跳过');
  await page.locator('.ann-record').click();
  await page.keyboard.press('2');
  await expect(page.locator('.ann-header')).toContainText('2 / 3');
  await page.getByLabel('标注状态筛选', { exact: true }).selectOption('all');
  await page.locator('.ann-record').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.ann-record')).toContainText('已跳过');
  await page.locator('.ann-record').click();
  await page.keyboard.press('2');
  await expect(page.locator('.ann-header')).toContainText('2 / 3');
  await page.reload();
  await page.getByRole('button', { name: '数据标注', exact: true }).click();
  await page.getByRole('button', { name: '继续标注', exact: true }).click();
  await expect(page.locator('.ann-header')).toContainText('2 / 3');
  await expect(page.locator('.ann-record h2')).toHaveText('普通文章');
  await page.getByRole('button', { name: '← 上一条', exact: true }).click();
  await expect(page.locator('.ann-record')).toContainText('生日');
  await page.getByLabel('标注后自动下一条', { exact: true }).uncheck();
  await page.locator('.ann-label-button').filter({ hasText: '活动' }).click();
  await expect(page.locator('.ann-record')).toContainText('当前标签：活动');
  await page.getByRole('button', { name: '导出训练数据', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载标注数据 ZIP' }).click();
  const zip = readFileSync((await (await event).path())!);
  expect(zip.includes(Buffer.from('annotated.jsonl'))).toBe(true);
  expect(zip.includes(Buffer.from('"text":"生日文章","label":"活动"'))).toBe(true);
  await page.getByLabel('标注导出格式', { exact: true }).selectOption('fasttext');
  const event2 = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载标注数据 ZIP' }).click();
  expect(
    readFileSync((await (await event2).path())!).includes(Buffer.from('__label__活动 活动文章')),
  ).toBe(true);
  await page.getByRole('button', { name: '更新数据源', exact: true }).click();
  await page
    .getByLabel('标注文件', { exact: true })
    .setInputFiles({
      name: 'posts.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify(
          [...rows].reverse().concat({ post_id: '40', title: '新增文章', content: '新正文' }),
        ),
      ),
    });
  await page.getByRole('button', { name: '扫描所选数据', exact: true }).click();
  await expect(page.getByRole('heading', { name: /扫描完成/ })).toBeVisible();
  await page.getByRole('checkbox', { name: '已核对数据、字段和本地保存方式' }).check();
  await page.getByRole('button', { name: '对比数据源变化' }).click();
  await expect(page.locator('.ann-notice')).toContainText('新增 1');
  await page.getByRole('button', { name: '确认更新当前数据源' }).click();
  await expect(page.locator('.ann-header')).toContainText('2 / 4');
  await page.getByRole('button', { name: '统计与质量检查', exact: true }).click();
  await expect(page.getByRole('img', { name: '标注标签分布' })).toBeVisible();
  await page.screenshot({ path: 'test-results/annotation-stats.png', fullPage: true });
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await page.screenshot({ path: 'test-results/annotation-workspace.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('annotation folder scans raw.json without duplicate processed.json', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'annotation-'));
  try {
    for (const id of ['10', '20']) {
      mkdirSync(join(dir, id));
      writeFileSync(
        join(dir, id, 'raw.json'),
        JSON.stringify({ post_id: id, title: '文章 ' + id }),
      );
      writeFileSync(
        join(dir, id, 'processed.json'),
        JSON.stringify({ post_id: id, title: '重复 ' + id }),
      );
    }
    await page.goto('/');
    await page.getByRole('button', { name: '数据标注', exact: true }).click();
    await page.getByLabel('标注文件夹', { exact: true }).setInputFiles(dir);
    await expect(page.locator('.ann-import')).toContainText('选中 2 个');
    await page.getByRole('button', { name: '扫描所选数据', exact: true }).click();
    await expect(page.getByRole('heading', { name: /扫描完成/ })).toContainText('2 条');
    await expect(page.locator('.ann-table')).toContainText('文章 10');
    await expect(page.locator('.ann-table')).not.toContainText('重复 10');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
