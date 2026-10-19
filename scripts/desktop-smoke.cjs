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
      await page.locator('input[type=file]').setInputFiles({
        name: 'desktop-test.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('id,value,label\n1,20,a\n2,30,b\n3,40,a'),
      });
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
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
