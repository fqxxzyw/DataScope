# 支持矩阵与扩展约定

容器格式、任务 schema、模型编码是三层不同概念。不能仅靠名字识别“BERT 数据”。这里的适配器是明确字段映射与语法校验，不包含大模型推断。

| 类型 | 读入 | 输出 | 约束 |
|---|---|---|---|
| CSV / TSV / 分号 / 竖线 | 是 | CSV/TSV | Papa Parse，字段数一致，引号合法 |
| TXT | 是 | 是 | 每行一条；空行保留 |
| JSON 对象数组 / JSONL | 是 | JSONL | 对象记录；字段并集；嵌套保留 JSON 字符串 |
| fastText | 是 | 是 | 行首 __label__，单/多标签；标签不得含空白 |
| BERT/HF 单句分类 | 通过表格/JSONL | 是 | text、label；不生成模型 token |
| 句对分类/NLI | 通过表格/JSONL | 是 | text、text_pair、label |
| 多标签 | 通过表格/JSONL | 是 | text、非空 labels 数组 |
| 回归 | 通过表格/JSONL | 是 | text、有限数值 label |
| 两列 CoNLL/BIO/BIOES/BILOU | 是 | 是 | token/tag，空行分句，长度与转移检查 |
| NER JSONL | JSONL | 是 | 等长 tokens/tags，训练端再做 subword 标签对齐 |
| Seq2Seq/翻译/摘要 | 表格/JSONL | 是 | source、target |
| 指令 | JSONL/表格 | 是 | instruction、input、output；input 可空 |
| 对话 | JSONL | 是 | messages role/content 数组；无模型 chat template |
| 偏好比较 DPO | JSONL/表格 | 是 | prompt、chosen、rejected，回答须不同 |
| 抽取式问答 | JSONL/表格 | 是 | context、question、answers{text,answer_start}；码点偏移验证 |
| 对比学习/检索 | JSONL/表格 | 是 | anchor、positive、negative |
| 图像/音频/视频 | 仅元数据表 | 通用表格 | 不读取媒体内容 |
| Excel/Parquet/Arrow/SQL | 否 | 否 | 先转换 CSV/JSONL |
| TFRecord/LibSVM/预编码 token IDs | 否 | 否 | 需专门 schema/稀疏/词表适配器 |
| 嵌套 SQuAD/ShareGPT/多列 CoNLL | 不自动解释 | 否 | 先整理为明确记录结构 |

处理默认不清洗。可选 trim / NFC / 合并空白 / 移除映射必需空字段行 / 映射后精确去重。检查失败会阻止整体导出；错误最多列前 100 条但总失败数完整。清洗只产生副本和 manifest。

通用 JSONL 从表格字符串重建，不保证与原 JSON 类型 round-trip。任务适配器会为 labels/tokens/tags/messages/answers 等字段恢复受约束的数组/对象。fastText 导入将词间空白规范为单空格，明确提示。

## 官方格式参考

- [fastText supervised tutorial](https://fasttext.cc/docs/en/supervised-tutorial.html)
- [Hugging Face Datasets loading](https://huggingface.co/docs/datasets/en/loading)

扩展一个新格式时，先定义识别证据、必需字段、值类型、空值行为、错误策略与保真边界，再增加正反测试和 UI 选项。不要以“覆盖所有格式”为验收承诺。
