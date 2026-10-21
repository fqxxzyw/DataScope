import { buildBundle, type BundleFile, type BundleOptions } from './bundle';
import { makeZip } from './zip';
import type { Dataset } from './types';
self.onmessage = ({
  data,
}: MessageEvent<{ datasets: (Dataset | null)[]; files: BundleFile[]; options: BundleOptions }>) => {
  try {
    const outputs = buildBundle(data.datasets, data.files, data.options);
    const manifest = JSON.stringify(
      {
        options: data.options,
        files: data.files.map((f, i) => ({ ...f, name: data.datasets[i]?.name || '' })),
        outputs: outputs.map((o) => ({ name: o.name, rows: o.rows })),
      },
      null,
      2,
    );
    const zip = makeZip([...outputs, { name: 'processing-manifest.json', content: manifest }]);
    self.postMessage(
      { outputs: outputs.map((o) => ({ name: o.name, rows: o.rows, preview: o.preview })), zip },
      { transfer: [zip.buffer as ArrayBuffer] },
    );
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
