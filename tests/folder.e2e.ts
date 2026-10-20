import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('folder import keeps train/dev/test separate and offers help at each operation', async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'datascope-bundle-'));
  try {
    for (const [name, text] of Object.entries({
      'train.txt': '学校新闻\t1\n经济新闻\t0',
      'dev.txt': '验证新闻\t1',
      'test.txt': '测试新闻\t0',
      'clasee.txt': 'finance\neducation',
      'stop_word.txt': '的\n了',
      'notes.txt': '备注，不参与训练',
    }))
      writeFileSync(join(dir, name), text);
    await page.goto('/');
    await page.getByLabel('选择数据文件夹', { exact: true }).setInputFiles(dir);
    await expect(page.locator('.folder-studio')).toBeVisible();
    await expect(page.getByLabel('clasee.txt 文件用途', { exact: true })).toHaveValue('classes');
    await expect(page.getByLabel('stop_word.txt 文件用途', { exact: true })).toHaveValue(
      'stopwords',
    );
    await expect(page.getByLabel('notes.txt 文件用途', { exact: true })).toHaveValue('ignore');
    await expect(page.getByLabel('train.txt 标签列', { exact: true })).toHaveValue('Number');
    await page
      .getByRole('checkbox', { name: '我已核对文件用途、字段、类别顺序与处理选项', exact: true })
      .check();
    await page.getByRole('button', { name: '预览三份数据的处理结果', exact: true }).click();
    await expect(page.locator('.bundle-results')).toContainText('train.fasttext.txt · 2 条');
    await expect(page.locator('.bundle-results')).toContainText('__label__education 学校新闻');
    await expect(page.locator('.bundle-results')).toContainText('dev.fasttext.txt · 1 条');
    await page
      .locator('.folder-rules')
      .getByRole('button', { name: '按词去停用词：查看动画帮助', exact: true })
      .hover();
    await expect(page.getByRole('dialog', { name: '按词去停用词', exact: true })).toContainText(
      '按完整词匹配',
    );
    await page.screenshot({ path: 'test-results/folder-stopwords-help.png', fullPage: true });
    await page.getByRole('button', { name: '关闭动画帮助', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载数据集 ZIP', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('datascope-fasttext-dataset.zip');
    const data = readFileSync((await download.path())!);
    expect(data.readUInt32LE(0)).toBe(0x04034b50);
    expect(data.includes(Buffer.from('train.fasttext.txt'))).toBe(true);
    expect(data.includes(Buffer.from('processing-manifest.json'))).toBe(true);
    await page.getByRole('checkbox', { name: '应用停用词表', exact: true }).check();
    await expect(page.locator('.bundle-results')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
