import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, HeatmapChart, ScatterChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  DataZoomComponent,
  AriaComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useStore } from '../store';
echarts.use([
  BarChart,
  ScatterChart,
  LineChart,
  BoxplotChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  DataZoomComponent,
  AriaComponent,
  LegendComponent,
  CanvasRenderer,
]);
export function Chart({
  option,
  label,
  height = 280,
}: {
  option: echarts.EChartsCoreOption;
  label: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    theme = useStore((s) => s.theme);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, theme === 'dark' ? 'dark' : undefined);
    chart.setOption({
      backgroundColor: 'transparent',
      color: ['#657fe8', '#8eaae8', '#b1a2dc'],
      textStyle: { fontFamily: 'Inter, system-ui' },
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      aria: { enabled: true },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      grid: { top: 22, bottom: 48, left: 58, right: 20 },
      ...option,
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [option, theme]);
  return <div role="img" aria-label={label} ref={ref} style={{ height, width: '100%' }} />;
}
export function Bars({
  items,
  label,
  horizontal = false,
  height = 280,
}: {
  items: [string, number][];
  label: string;
  horizontal?: boolean;
  height?: number;
}) {
  const cat = {
      type: 'category',
      data: items.map((x) => x[0]),
      axisLabel: { color: 'inherit', overflow: 'truncate', width: 90 },
    },
    value = {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: 'rgba(130,145,175,.15)' } },
    };
  return (
    <Chart
      label={label}
      height={height}
      option={{
        grid: { left: horizontal ? 105 : 50, right: 24, top: 20, bottom: 55 },
        xAxis: horizontal ? value : cat,
        yAxis: horizontal ? { ...cat, inverse: true } : value,
        series: [
          {
            type: 'bar',
            data: items.map((x) => x[1]),
            barMaxWidth: 30,
            itemStyle: {
              borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
                { offset: 0, color: '#6a80e4' },
                { offset: 1, color: '#a7b9f5' },
              ]),
            },
          },
        ],
      }}
    />
  );
}
