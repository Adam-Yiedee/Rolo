import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Contact } from '../lib/sheets';

interface GraphViewProps {
  contacts: Contact[];
  onNodeClick: (contact: Contact) => void;
}

const CATEGORY_COLORS = [
  '#e8e4d3',
  '#e6f0e6',
  '#e6eaf0',
  '#f0e6ea',
  '#f0ece6',
  '#e6f0ef',
  '#ede6f0'
];

const getCategoryColorHex = (category: string) => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
};

export function GraphView({ contacts, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || contacts.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous graph
    d3.select(containerRef.current).selectAll('*').remove();

    const nodes = contacts.map(c => ({ ...c, radius: 20 }));
    const links: any[] = [];

    contacts.forEach(source => {
      source.linkedContacts.forEach(link => {
        const target = contacts.find(c => c.id === link.id);
        if (target) {
          links.push({ source: source.id, target: target.id, label: link.relation });
        }
      });
    });

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(30));

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(d3.zoom().on('zoom', (e) => {
        g.attr('transform', e.transform);
      }) as any);

    const g = svg.append('g');

    // Defs for images
    const defs = svg.append('defs');
    nodes.forEach(node => {
      if (node.profilePicture) {
        defs.append('pattern')
          .attr('id', `img-${node.id}`)
          .attr('patternContentUnits', 'objectBoundingBox')
          .attr('width', 1)
          .attr('height', 1)
          .append('image')
          .attr('href', node.profilePicture)
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 1)
          .attr('height', 1)
          .attr('preserveAspectRatio', 'xMidYMid slice');
      }
    });

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#e0dbc5')
      .attr('stroke-width', 2);

    const linkText = g.append('g')
      .selectAll('text')
      .data(links)
      .enter().append('text')
      .text(d => d.label)
      .attr('fill', '#a8a38d')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('dy', -5);

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', 20)
      .attr('fill', d => {
        if (d.profilePicture) return `url(#img-${d.id})`;
        if (d.categories && d.categories.length > 0) return getCategoryColorHex(d.categories[0]);
        return '#e8e4d3';
      })
      .attr('stroke', '#5a5a40')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (e, d) => onNodeClick(d as Contact))
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    const labels = g.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', '12px')
      .attr('fill', '#4a453e')
      .attr('font-weight', 'bold')
      .attr('dx', 25)
      .attr('dy', 4);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkText
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [contacts, onNodeClick]);

  return <div ref={containerRef} className="w-full h-full bg-[#f9f8f3] rounded-[24px] border border-[#e0dbc5] overflow-hidden" />;
}
