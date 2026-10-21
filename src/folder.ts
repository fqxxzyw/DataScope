export const supportedDataFile = (f: File) => /\.(csv|tsv|txt|jsonl|json|conll|bio)$/i.test(f.name);
// Read every directory batch: Chromium may return only 100 entries per readEntries call.
export async function droppedFiles(items: DataTransferItemList): Promise<File[]> {
  const entries = Array.from(items)
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => !!e);
  const files: File[] = [];
  let visited = 0,
    total = 0;
  async function walk(entry: FileSystemEntry, path = ''): Promise<void> {
    if (++visited > 1000) throw new Error('文件夹条目超过 1000，请选择数据子文件夹。');
    if (entry.name.startsWith('.')) return;
    if (entry.isFile) {
      const f = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      if (supportedDataFile(f)) {
        total += f.size;
        if (files.length >= 40 || total > 100 * 1024 * 1024)
          throw new Error('一次最多导入 40 个数据文件、合计 100 MB，请选择数据子文件夹。');
        if (path) Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name });
        files.push(f);
      }
    } else {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const e of batch) await walk(e, path + entry.name + '/');
      }
    }
  }
  for (const entry of entries) await walk(entry);
  return files;
}
