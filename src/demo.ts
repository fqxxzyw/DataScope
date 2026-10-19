export function demoFile(numeric = false) {
  if (numeric)
    return new File(
      [
        'id,age,income,score\n1,21,3200,61\n2,24,4100,68\n3,28,5100,72\n4,32,6200,78\n5,35,7000,83\n6,39,8200,88\n7,42,9100,91\n8,45,10200,93\n9,48,180000,95\n10,,12000,97\n11,51,13000,98\n12,54,14000,99',
      ],
      'numeric_demo.csv',
      { type: 'text/csv' },
    );
  const sentences = [
    '这个酒店很好，位置便利。',
    '房间很干净，早餐丰富，值得再次入住。',
    '工作人员服务热情，入住过程很顺利。',
    '交通方便，附近有地铁和很多餐厅。',
    '整体体验不错，床很舒服。',
    '服务太差，晚上很吵。',
    '房间隔音一般，设施需要维护。',
    '酒店位置不错，但是早餐选择不多。',
  ];
  const rows = Array.from(
    { length: 240 },
    (_, i) =>
      `${i + 1}\t${i % 31 === 0 ? '' : i % 47 === 0 ? '好' : i % 53 === 0 ? 'N/A' : sentences[i % 8]}${i % 67 === 0 ? ' 这是一段很长的体验补充说明。'.repeat(12) : ''}\t${i % 17 === 0 ? 'negative' : i % 23 === 0 ? 'neutral' : 'positive'}\t${i % 29 === 0 ? '' : i % 61 === 0 ? 1800 : 100 + ((i * 17) % 500)}`,
  );
  rows.push(rows[12], rows[24], rows[36], rows[48], rows[60], rows[72]);
  return new File(['review_id\tsentence\tlabel\tprice\n' + rows.join('\n')], 'hotel_reviews.tsv', {
    type: 'text/tab-separated-values',
  });
}
