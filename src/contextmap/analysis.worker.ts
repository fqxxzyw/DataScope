import { analyze, sparseCosine } from './nlp';
import { parseText } from './parser';
import { LIMITS } from './defaults';
import type { Analysis, WorkerRequest, WorkerResponse } from './types';
let result: Analysis | undefined;
const send = (message: WorkerResponse) => self.postMessage(message);
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const m = e.data;
    if (m.type === 'parse')
      send({ type: 'parsed', data: parseText(m.text, m.name, m.header, m.whole) });
    if (m.type === 'analyze') {
      result = analyze(m.documents, m.settings, m.stops, (message) =>
        send({ type: 'progress', message }),
      );
      send({ type: 'result', data: result });
    }
    if (m.type === 'matrix') {
      if (!result) throw new Error('请先完成分析');
      if (
        m.indices.length > LIMITS.matrix ||
        m.indices.some((i) => !Number.isInteger(i) || i < 0 || i >= result!.vectors.length)
      )
        throw new Error('矩阵范围无效');
      const r = result;
      send({
        type: 'matrix',
        indices: m.indices,
        values: m.indices.flatMap((a, i) =>
          m.indices.map((b, j): [number, number, number] => [
            i,
            j,
            sparseCosine(r.vectors[a], r.vectors[b]),
          ]),
        ),
      });
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
