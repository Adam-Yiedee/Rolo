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

type GraphNode = Contact & {
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type ContactLink = {
  source: string;
  target: string;
  label: string;
};

type CategoryLink = {
  source: string;
  target: string;
  sharedCategories: number;
};

type CategorySpreadPair = {
  source: GraphNode;
  target: GraphNode;
};

const getContactPairKey = (firstId: string, secondId: string) => {
  return [firstId, secondId].sort().join('::');
};

const getSharedCategoryCount = (first: Contact, second: Contact) => {
  const firstCategories = new Set((first.categories || []).filter(Boolean));
  if (firstCategories.size === 0) return 0;

  return (second.categories || []).filter((category) => firstCategories.has(category)).length;
};

const bothContactsHaveCategories = (first: Contact, second: Contact) => {
  return (first.categories || []).length > 0 && (second.categories || []).length > 0;
};

const createUnlikeCategorySpreadForce = (pairs: CategorySpreadPair[]) => {
  const targetDistance = 250;
  const strength = 0.018;

  return (alpha: number) => {
    pairs.forEach(({ source, target }) => {
      const sourceX = source.x || 0;
      const sourceY = source.y || 0;
      const targetX = target.x || 0;
      const targetY = target.y || 0;
      let dx = targetX - sourceX;
      let dy = targetY - sourceY;
      let distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0) {
        dx = (Math.random() - 0.5) * 0.01;
        dy = (Math.random() - 0.5) * 0.01;
        distance = Math.sqrt(dx * dx + dy * dy);
      }

      if (distance >= targetDistance) return;

      const push = ((targetDistance - distance) / distance) * strength * alpha;
      const x = dx * push;
      const y = dy * push;

      source.vx = (source.vx || 0) - x;
      source.vy = (source.vy || 0) - y;
      target.vx = (target.vx || 0) + x;
      target.vy = (target.vy || 0) + y;
    });
  };
};

export function GraphView({ contacts, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || contacts.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous graph
    d3.select(containerRef.current).selectAll('*').remove();

    const nodes: GraphNode[] = contacts.map(c => ({ ...c, radius: 20 }));
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const links: ContactLink[] = [];
    const categoryLinks: CategoryLink[] = [];
    const categorySpreadPairs: CategorySpreadPair[] = [];
    const linkedPairKeys = new Set<string>();

    contacts.forEach(source => {
      source.linkedContacts.forEach(link => {
        const target = contacts.find(c => c.id === link.id);
        if (target) {
          links.push({ source: source.id, target: target.id, label: link.relation });
          linkedPairKeys.add(getContactPairKey(source.id, target.id));
        }
      });
    });

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const source = contacts[i];
        const target = contacts[j];
        const sharedCategories = getSharedCategoryCount(source, target);
        if (linkedPairKeys.has(getContactPairKey(source.id, target.id))) continue;

        if (sharedCategories === 0) {
          const sourceNode = nodesById.get(source.id);
          const targetNode = nodesById.get(target.id);
          if (sourceNode && targetNode && bothContactsHaveCategories(source, target)) {
            categorySpreadPairs.push({
              source: sourceNode,
              target: targetNode,
            });
          }
          continue;
        }

        categoryLinks.push({
          source: source.id,
          target: target.id,
          sharedCategories,
        });
      }
    }

    const simulation = d3.forceSimulation(nodes as any)
      .velocityDecay(0.34)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(115).strength(0.68))
      .force('category', d3.forceLink(categoryLinks).id((d: any) => d.id).distance(130).strength((d: any) => Math.min(0.22, 0.13 + d.sharedCategories * 0.035)))
      .force('unlikeCategorySpread', createUnlikeCategorySpreadForce(categorySpreadPairs))
      .force('charge', d3.forceManyBody().strength(-280).distanceMax(460))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.025))
      .force('y', d3.forceY(height / 2).strength(0.025))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 28).strength(0.95));

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
