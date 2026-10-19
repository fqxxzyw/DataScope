import { prepare } from './prepare';
import Papa from 'papaparse';
import { explore, evaluatePredictions } from './explore';
import { splitDataset } from './split';
/// <reference lib="webworker" />
import { parseInput } from './formats';
import { convert } from './processing';
import { analyze } from './analyze';
import { wordFrequency } from './text';
import { problemCsv } from './export';
import { defaults, type Dataset, type WorkerRequest, type WorkerResponse } from './types';
let dataset: Dataset | undefined, original: Dataset | undefined;
const undo: Dataset[] = [];
const send = (m: WorkerResponse) => self.postMessage(m);
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      if (m.file && m.file.size > m.settings.maxFileMB * 1024 * 1024)
        throw new Error('文件超过 50 MB 保护上限，请拆分后导入。');
      send({ type: 'progress', value: 5, message: '读取 UTF-8 文件' });
      const text = m.file ? await m.file.text() : '';
      send({ type: 'progress', value: 25, message: '解析数据结构' });
      if (!m.dataset && !m.file) throw new Error('没有导入数据');
      dataset =
        m.dataset ||
        parseInput(
          text,
          m.file?.name || 'dataset',
          m.file?.size || 0,
          m.delimiter,
          m.header,
          m.settings,
          m.format,
        );
      original = dataset;
      undo.length = 0;
      send({
        type: 'report',
        report: analyze(dataset, m.settings, {}, undefined, (value, message) =>
          send({ type: 'progress', value, message }),
        ),
      });
      return;
    }
    if (!dataset) throw new Error('请重新打开原始数据集。');
    const d = dataset;
    if (m.type === 'saveData') {
      const headers = m.columns.length ? m.columns : d.headers;
      const indexes = headers.map((h) => d.headers.indexOf(h));
      if (indexes.some((i) => i < 0)) throw new Error('导出列不存在');
      const content =
        m.format === 'csv'
          ? Papa.unparse(
              { fields: headers, data: d.rows.map((r) => indexes.map((i) => r[i])) },
              { escapeFormulae: true },
            )
          : d.rows
              .map((r) =>
                JSON.stringify(Object.fromEntries(headers.map((h, j) => [h, r[indexes[j]]]))),
              )
              .join('\n');
      send({ type: 'savedData', id: m.id, content });
    }
    if (m.type === 'prepare') {
      const out = prepare(d, m.steps);
      if (m.apply) {
        undo.push(d);
        if (undo.length > 3) undo.shift();
        dataset = out.dataset;
      }
      send({
        type: 'prepared',
        id: m.id,
        audit: out.audit,
        warnings: out.warnings,
        headers: out.dataset.headers,
        preview: out.dataset.rows.slice(0, 10),
        rows: out.dataset.rows.length,
        report: m.apply ? analyze(out.dataset, defaults) : undefined,
      });
    }
    if (m.type === 'restore') {
      const restored = m.original ? original : undo.pop();
      if (!restored) throw new Error('没有可撤销的步骤');
      dataset = restored;
      if (m.original) undo.length = 0;
      send({
        type: 'prepared',
        id: m.id,
        audit: [],
        warnings: [],
        headers: restored.headers,
        preview: restored.rows.slice(0, 10),
        rows: restored.rows.length,
        report: analyze(restored, defaults),
      });
    }

    if (m.type === 'explore') send({ type: 'explored', id: m.id, result: explore(d, m.config) });
    if (m.type === 'evaluate')
      send({
        type: 'evaluated',
        id: m.id,
        result: evaluatePredictions(d, m.truth, m.prediction, m.task),
      });
    if (m.type === 'split')
      send({ type: 'splitResult', id: m.id, result: splitDataset(d, m.config) });
    if (m.type === 'convert') send({ type: 'converted', id: m.id, result: convert(d, m.config) });
    if (m.type === 'reanalyze') {
      send({
        type: 'report',
        report: analyze(d, m.settings, m.overrides, m.target, (value, message) =>
          send({ type: 'progress', value, message }),
        ),
      });
    }
    if (m.type === 'words') {
      const j = d.headers.indexOf(m.column),
        t = d.headers.indexOf(m.target || '');
      const values = d.rows
        .filter((r) => t < 0 || m.label === undefined || r[t] === m.label)
        .map((r) => r[j] || '');
      send({ type: 'words', id: m.id, ...wordFrequency(values, m.mode, m.hideStop, m.top) });
    }
    if (m.type === 'export')
      send({ type: 'export', id: m.id, csv: problemCsv(d, m.rows, m.issue) });
    if (m.type === 'rows') {
      const j = d.headers.indexOf(m.column),
        q = m.search.toLowerCase(),
        subset = m.issueRows ? new Set(m.issueRows) : null;
      let ids = d.rows.flatMap((r, i) =>
        (!subset || subset.has(i)) &&
        (!q || (j >= 0 ? r[j] : r.join(' ')).toLowerCase().includes(q))
          ? [i]
          : [],
      );
      const total = ids.length;
      if (m.sort >= 0)
        ids.sort(
          (a, b) =>
            d.rows[a][m.sort].localeCompare(d.rows[b][m.sort], undefined, { numeric: true }) *
            (m.desc ? -1 : 1),
        );
      if (m.mode === 'last') ids = ids.slice(-50);
      else if (m.mode === 'random') {
        // Deterministic sample: stable across repeated renders.
        let seed = 42;
        for (let i = ids.length - 1; i > 0; i--) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const j = seed % (i + 1);
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        ids = ids.slice(0, 50);
      } else if (m.mode === 'first') ids = ids.slice(0, 50);
      send({
        type: 'rows',
        id: m.id,
        total,
        rows: ids.slice(m.offset, m.offset + 50).map((index) => ({ index, values: d.rows[index] })),
      });
    }
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : '分析失败，请检查文件格式。',
    });
  }
};
