import { parseInput } from './formats';
import { defaults } from './types';
self.onmessage = async ({
  data,
}: MessageEvent<{
  file: File;
  name?: string;
  header: boolean | 'auto';
  delimiter: string;
  format: string;
}>) => {
  try {
    if (data.file.size > defaults.maxFileMB * 1024 * 1024)
      throw new Error('单个文件不能超过 50 MB');
    const d = parseInput(
      await data.file.text(),
      data.name || data.file.name,
      data.file.size,
      data.delimiter,
      data.header,
      defaults,
      data.format,
    );
    self.postMessage({ dataset: d });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
