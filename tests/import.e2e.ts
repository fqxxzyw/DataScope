import { test, expect } from '@playwright/test';
test('preview first, associate a label file, then export fastText numeric labels', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      {
        name: 'sentences.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('第一条评论\n第二条评论'),
      },
      { name: 'labels.txt', mimeType: 'text/plain', buffer: Buffer.from('1\n2') },
    ]);
  await expect(page.getByText('先看看，你的数据长什么样。')).toBeVisible();
  await expect(page.locator('.raw-table').first()).toContainText('第一条评论');
  await page.getByLabel('首行规则').click();
  await page.screenshot({ path: 'test-results/import-preview-menu.png' });
  await page.keyboard.press('Escape');
  await page.getByLabel('文件组合方式').selectOption('rows');
  await page.getByRole('checkbox', { name: /我已确认两个文件/ }).check();
  await page.getByRole('button', { name: '确认数据，开始分析' }).click();
  await expect(page.locator('.data-first')).toContainText('第一条评论');
  await expect(page.locator('.data-first')).toContainText('Number');
  await page.getByRole('button', { name: '确认正文与标签', exact: true }).click();
  await page.getByTitle('格式与处理', { exact: true }).click();
  await page.getByLabel('输出适配器').selectOption('fasttext');
  await expect(page.getByLabel('映射 labels')).toHaveValue('labels.txt · Number');
  await page.getByRole('button', { name: '校验并生成预览' }).click();
  await expect(page.locator('.preview-code')).toContainText('__label__1 第一条评论');
  await page.getByRole('button', { name: '导出报告', exact: true }).click();
  const box = await page.locator('dialog').boundingBox();
  const size = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - size.width / 2)).toBeLessThan(3);
  expect(Math.abs(box!.y + box!.height / 2 - size.height / 2)).toBeLessThan(3);
  await page.screenshot({ path: 'test-results/import-dialog.png' });
});
test('tab-separated TXT retains all columns and generated names', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'unheaded.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('一条文字\t1\tA\n另一条文字\t2\tB'),
    });
  await expect(page.getByLabel('第 2 列名称')).toHaveValue('Number');
  await page.getByRole('button', { name: '确认数据，开始分析' }).click();
  await expect(page.locator('.data-first th')).toHaveCount(4);
  const firstPanel = await page.locator('main .panel').first().getAttribute('class');
  expect(firstPanel).toContain('data-first');
  await page.getByText('可视化：选择字段生成图表').click();
  await expect(page.getByLabel('图表 X 字段').locator('option')).toHaveCount(4);
  await expect(page.getByLabel('图表 Y 字段').locator('option')).toHaveCount(4);
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.screenshot({ path: 'test-results/workbench-dark.png', fullPage: true });
});
test('class list maps IDs to names and explains the workflow without modifying samples', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      {
        name: 'train.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('学校新闻\t3\n金融新闻\t0\n房屋新闻\t1'),
      },
      {
        name: 'class.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('finance\nrealty\nstocks\neducation'),
      },
      { name: 'stopwords.txt', mimeType: 'text/plain', buffer: Buffer.from('的\n了') },
    ]);
  await expect(page.getByLabel('第 2 列名称')).toHaveValue('Number');
  await page.getByRole('button', { name: '配置样本 + class 类别列表' }).click();
  await expect(page.getByLabel('类别编号列')).toHaveValue('Number');
  await expect(page.getByText('3 → education', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认数据，开始分析' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '我已核对类别顺序与编号起点，按此映射' }).check();
  await expect(page.locator('.raw-table').last()).toContainText('class.txt · Label');
  await page.getByRole('button', { name: 'class + train → fastText：查看动画帮助' }).last().hover();
  await expect(page.getByRole('dialog', { name: 'class + train → fastText' })).toContainText(
    '__label__education',
  );
  await page.screenshot({ path: 'test-results/class-mapping-help.png', fullPage: true });
  await page.getByRole('button', { name: '关闭动画帮助' }).click();
  await page.getByRole('button', { name: '确认数据，开始分析' }).click();
  await expect(page.locator('.data-first')).toContainText('education');
  await page.getByRole('button', { name: '确认正文与标签', exact: true }).click();
  await page.getByTitle('格式与处理', { exact: true }).click();
  await page.getByLabel('输出适配器', { exact: true }).selectOption('fasttext');
  await expect(page.getByLabel('映射 labels', { exact: true })).toHaveValue('class.txt · Label');
  await page.getByRole('button', { name: '校验并生成预览' }).click();
  await expect(page.locator('.preview-code')).toContainText('__label__education 学校新闻');
  await page.getByRole('button', { name: '去除首尾空白：查看动画帮助' }).hover();
  await expect(page.getByRole('dialog', { name: '去除首尾空白' })).toContainText('hello world');
  await page.getByRole('button', { name: '关闭动画帮助' }).click();
  await page.getByText('操作图解 · 查看每一步如何改变数据', { exact: true }).click();
  await page.getByLabel('搜索操作图解').fill('One-hot');
  await expect(page.locator('.help-library-grid')).toContainText('One-hot');
});
