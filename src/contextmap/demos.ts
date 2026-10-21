import type { TextDocument } from './types';
export const demos: Record<string, TextDocument[]> = {
  酒店评论: [
    { text: '酒店的位置很好，房间非常干净。', label: 'positive' },
    { text: '酒店服务不错，早餐也很好。', label: 'positive' },
    { text: '房间有一点小，但是交通非常方便。', label: 'negative' },
    { text: '前台服务很好，入住速度很快。', label: 'positive' },
    { text: '酒店房间很脏，晚上很吵，服务很差。', label: 'negative' },
    { text: '酒店交通方便，早餐不错，入住很满意。', label: 'positive' },
  ],
  新闻文本: [
    '城市新增地铁线路，市民交通更加方便。',
    '地铁连接城市中心与大学。',
    '大学开展人工智能技术研究。',
    '人工智能技术帮助城市交通管理。',
  ].map((text) => ({ text })),
  技术文章: [
    'React components render user interfaces.',
    'TypeScript adds types to JavaScript.',
    'React uses JavaScript and TypeScript components.',
    'Web workers run computation outside the main thread.',
  ].map((text) => ({ text })),
  短句相似度: [
    '酒店服务很好，房间干净。',
    '酒店房间干净，服务很好。',
    '地铁交通方便。',
    '房间很吵，服务很差。',
  ].map((text) => ({ text })),
};
