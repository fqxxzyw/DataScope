const { _electron: electron, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
fs.mkdirSync('test-results', { recursive: true });
(async () => {
  const executablePath =
    process.env.DATASCOPE_EXE || path.resolve('release/win-unpacked/DataScope.exe');
  for (const scale of [1, 1.25, 1.5, 2]) {
    const app = await electron.launch({
      executablePath,
      args: [`--force-device-scale-factor=${scale}`],
    });
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await expect(page.getByText('将数据集拖到这里')).toBeVisible();
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'desktop-test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('id,value,label\n1,20,a\n2,30,b\n3,40,a'),
        });
      await page.getByRole('button', { name: '确认数据，开始分析' }).click();
      await expect(page.locator('.dataset-strip')).toContainText('desktop-test.csv', {
        timeout: 30000,
      });
      await expect(page.locator('.loading')).toHaveCount(0, { timeout: 30000 });
      for (const title of [
        '数据整理',
        '字段与训练配置',
        '格式与处理',
        '数据集划分',
        '分析工作台',
      ]) {
        await page.getByTitle(title, { exact: true }).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.screenshot({ path: `test-results/desktop-${scale}.png` });
      const destination = path.resolve(`test-results/desktop-${scale}.json`);
      // Electron uses a native save dialog; observe its real download lifecycle
      // and select a destination in the test instead of waiting on browser CDP downloads.
      await app.evaluate(({ session }, savePath) => {
        globalThis.downloadResult = null;
        session.defaultSession.once('will-download', (_event, item) => {
          const filename = item.getFilename();
          item.setSavePath(savePath);
          item.once('done', (_event, state) => {
            globalThis.downloadResult = { filename, state };
          });
        });
      }, destination);
      await page.getByRole('button', { name: '导出报告', exact: true }).click();
      await page.getByRole('button', { name: /JSON 分析结果/ }).click();
      await expect
        .poll(() => app.evaluate(() => globalThis.downloadResult), { timeout: 30000 })
        .toEqual({
          filename: 'desktop-test.csv-analysis.json',
          state: 'completed',
        });
      expect(JSON.parse(fs.readFileSync(destination, 'utf8')).name).toBe('desktop-test.csv');
      await page.getByRole('button', { name: '文本语义探索', exact: true }).click();
      await page.getByRole('button', { name: '酒店评论', exact: true }).click();
      await expect(page.locator('.cm-stats')).toContainText('6 documents', { timeout: 30000 });
      await page
        .getByRole('navigation', { name: 'ContextMap 视图' })
        .getByRole('button', { name: 'Similarity', exact: true })
        .click();
      await page.getByRole('button', { name: '生成 Similarity Matrix' }).click();
      await expect(page.getByRole('img', { name: 'Similarity Matrix' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({ path: `test-results/contextmap-desktop-${scale}.png` });
      if (scale === 1) {
        const folder = path.resolve('test-results/input-dataset');
        fs.mkdirSync(folder, { recursive: true });
        for (const [name, content] of Object.entries({
          'train.txt': '学校新闻\t1\n经济新闻\t0',
          'dev.txt': '验证新闻\t1',
          'test.txt': '测试新闻\t0',
          'clasee.txt': 'finance\neducation',
          'stop_word.txt': '的\n了',
        }))
          fs.writeFileSync(path.join(folder, name), content);
        await page.getByLabel('选择数据文件夹', { exact: true }).setInputFiles(folder);
        await expect(page.getByLabel('train.txt 标签列', { exact: true })).toHaveValue('Number');
        await page
          .getByRole('checkbox', {
            name: '我已核对文件用途、字段、类别顺序与处理选项',
            exact: true,
          })
          .check();
        await page.getByRole('button', { name: '预览三份数据的处理结果', exact: true }).click();
        await expect(page.locator('.bundle-results')).toContainText('__label__education 学校新闻');
        const zipPath = path.resolve('test-results/desktop-bundle.zip');
        await app.evaluate(({ session }, savePath) => {
          globalThis.bundleDownload = null;
          session.defaultSession.once('will-download', (_event, item) => {
            item.setSavePath(savePath);
            item.once('done', (_event, state) => {
              globalThis.bundleDownload = state;
            });
          });
        }, zipPath);
        await page.getByRole('button', { name: '下载数据集 ZIP', exact: true }).click();
        await expect.poll(() => app.evaluate(() => globalThis.bundleDownload)).toBe('completed');
        expect(fs.readFileSync(zipPath).readUInt32LE(0)).toBe(0x04034b50);
      }
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
