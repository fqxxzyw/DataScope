import { parseInput } from '../engine/formats';
import { defaults } from '../engine/types';
import { limits, type Scan, type ScanMessage, type ScanRequest, type SourceRow } from './types';
const send = (m: ScanMessage) => self.postMessage(m);
self.onmessage = async (e: MessageEvent<ScanRequest>) => {
  try {
    const { files, header } = e.data;
    if (files.length > limits.files || files.reduce((n, f) => n + f.size, 0) > limits.bytes)
      throw new Error('最多 20,000 个文件、合计 200 MB');
    const rows: SourceRow[] = [],
      fields = new Set<string>(),
      warnings = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      const f = files[i],
        source = f.webkitRelativePath || f.name,
        text = await f.text();
      let objects: Record<string, unknown>[] | undefined,
        input = text;
      // Adapt single-object JSON files into the existing array parser, preserving original values.
      if (/\.json$/i.test(f.name)) {
        const v: unknown = JSON.parse(text);
        objects = (Array.isArray(v) ? v : [v]) as Record<string, unknown>[];
        input = JSON.stringify(objects);
      }
      if (/\.jsonl$/i.test(f.name))
        objects = text
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l));
      const d = parseInput(
        input,
        f.name,
        f.size,
        'auto',
        header,
        defaults,
        /\.txt$/i.test(f.name) ? 'text' : 'auto',
      );
      for (const h of d.headers) fields.add(h);
      d.rows.forEach((r, j) =>
        rows.push({
          source,
          data: objects?.[j] || Object.fromEntries(d.headers.map((h, k) => [h, r[k]])),
        }),
      );
      if (rows.length > limits.rows) throw new Error('最多 100,000 条记录，请分批建立项目');
      for (const warning of d.warnings) warnings.add(warning);
      send({ type: 'progress', count: i + 1, total: files.length });
    }
    if (!rows.length) throw new Error('未读取到记录');
    const scan: Scan = { rows, fields: [...fields], files: files.length, warnings: [...warnings] };
    send({ type: 'result', scan });
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
