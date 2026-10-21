import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { Edge, Term } from './types';
interface Node extends d3.SimulationNodeDatum {
  id: string;
  count: number;
}
interface Link extends d3.SimulationLinkDatum<Node> {
  weight: number;
}
export function Network({
  terms,
  edges,
  selected,
  onSelect,
}: {
  terms: Term[];
  edges: Edge[];
  selected: string;
  onSelect: (word: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    const width = 800,
      height = 460,
      nodes: Node[] = terms.map((t) => ({ id: t.word, count: t.count }));
    const allowed = new Set(nodes.map((n) => n.id));
    const links: Link[] = edges
      .filter((e) => allowed.has(e.source) && allowed.has(e.target))
      .map((e) => ({ ...e }));
    const g = svg.append('g');
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 4])
        .on('zoom', (e) => g.attr('transform', e.transform)),
    );
    const line = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--cm-line)')
      .attr('stroke-width', (d) => Math.min(7, 1 + Math.log2(d.weight)));
    const related = new Set([
      selected,
      ...edges
        .filter((e) => e.source === selected || e.target === selected)
        .flatMap((e) => [e.source, e.target]),
    ]);
    const node = g
      .append('g')
      .selectAll<SVGGElement, Node>('g')
      .data(nodes)
      .join('g')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.id}，词频 ${d.count}`)
      .style('cursor', 'grab')
      .attr('opacity', (d) => (!selected || related.has(d.id) ? 1 : 0.2));
    node
      .append('circle')
      .attr('r', (d) => 8 + Math.min(18, Math.sqrt(d.count) * 3))
      .attr('fill', (d) => (d.id === selected ? '#db8353' : '#638d91'));
    node
      .append('text')
      .text((d) => d.id)
      .attr('y', -22)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor')
      .attr('font-size', 13);
    node.append('title').text((d) => `${d.id} · ${d.count} 次`);
    node
      .on('click', (_, d) => onSelect(d.id))
      .on('keydown', (e, d) => {
        if (e.key === 'Enter') onSelect(d.id);
      });
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(100),
      )
      .force('charge', d3.forceManyBody().strength(-170))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(34));
    node.call(
      d3
        .drag<SVGGElement, Node>()
        .on('start', (e, d) => {
          if (!e.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on('end', (e, d) => {
          if (!e.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );
    const draw = () => {
      line
        .attr('x1', (d) => (d.source as Node).x || 0)
        .attr('y1', (d) => (d.source as Node).y || 0)
        .attr('x2', (d) => (d.target as Node).x || 0)
        .attr('y2', (d) => (d.target as Node).y || 0);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      simulation.stop();
      simulation.tick(150);
      draw();
    } else simulation.on('tick', draw);
    return () => {
      simulation.stop();
      svg.on('.zoom', null);
    };
  }, [terms, edges, selected, onSelect]);
  return <svg className="cm-network" ref={ref} viewBox="0 0 800 460" aria-label="词语共现网络" />;
}
