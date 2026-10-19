import { test, expect } from '@playwright/test';
for (const width of [720, 960, 1280, 1920]) {
  test(`long names and all workspaces at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/');
    const long = '超长字段名称_LongColumn_'.repeat(12);
    await page.locator('input[type=file]').setInputFiles({
      name: '超长数据文件名称_'.repeat(12) + '.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `id,${long},label\n` +
          Array.from({ length: 120 }, (_, i) => `${i},${i * 2},${i % 2 ? '正面' : '负面'}`).join(
            '\n',
          ),
      ),
    });
    await expect(page.locator('.dataset-strip')).toBeVisible({ timeout: 30000 });
    const check = async () => {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
      const overflow = await page
        .locator('button, .badge, .metric, .notice, .feature-picker label')
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => {
              const e = n as HTMLElement;
              return e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 2;
            })
            .map((n) => n.textContent?.slice(0, 80)),
        );
      expect(overflow).toEqual([]);
    };
    await check();
    for (const summary of await page.locator('details > summary').all()) {
      await summary.click();
      await check();
    }
    for (const title of ['数据整理', '字段与训练配置', '格式与处理', '数据集划分']) {
      await page.getByTitle(title, { exact: true }).click();
      await check();
    }
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await check();
    await page.getByRole('button', { name: '导出报告', exact: true }).click();
    await expect(page.locator('dialog')).toBeVisible();
    await check();
    expect(errors).toEqual([]);
  });
}
