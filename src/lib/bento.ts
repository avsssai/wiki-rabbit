import type { Topic } from './types';
import { priorities } from './topics';

export function tileSize(topic: Topic, index: number, parent: string | null): 'standard' | 'wide' | 'featured' {
  if (!parent) return topic.importance === 'featured' ? 'featured' : topic.importance === 'wide' ? 'wide' : 'standard';
  const preferred = priorities[parent];
  if (!preferred?.length) return index < 2 ? 'wide' : 'standard';
  return topic.importance === 'featured' ? 'featured' : topic.importance === 'wide' ? 'wide' : 'standard';
}

export function prioritize(topics: Topic[], parent: string): Topic[] {
  const preferred = priorities[parent] || [];
  return topics.map(topic => {
    const rank = preferred.indexOf(topic.title);
    return {...topic, importance: rank === 0 ? 'featured' : rank > 0 && rank < 3 ? 'wide' : 'standard'};
  });
}

export type Cell = { x: number; y: number; w: number; h: number };
// Partition the entire integer grid. Every split shares an edge, so no count or
// aspect ratio can leave an empty cell or an overlapping tile.
export function pack(weights: number[], width: number, height: number): Cell[] {
  const result: Cell[]=[];
  function split(start:number, end:number, rect:Cell) {
    if(end-start===1){result[start]=rect;return;}
    const total=weights.slice(start,end).reduce((a,b)=>a+b,0);
    let sum=0,cut=start+1,best=Infinity;
    for(let i=start;i<end-1;i++) {sum+=weights[i];const difference=Math.abs(total/2-sum);if(difference<best){best=difference;cut=i+1;}}
    const ratio=weights.slice(start,cut).reduce((a,b)=>a+b,0)/total;
    const horizontal=rect.w*width>=rect.h*height;
    if(horizontal){const size=Math.max(1,Math.min(rect.w-1,Math.round(rect.w*ratio)));split(start,cut,{...rect,w:size});split(cut,end,{...rect,x:rect.x+size,w:rect.w-size});}
    else {const size=Math.max(1,Math.min(rect.h-1,Math.round(rect.h*ratio)));split(start,cut,{...rect,h:size});split(cut,end,{...rect,y:rect.y+size,h:rect.h-size});}
  }
  if(weights.length)split(0,weights.length,{x:0,y:0,w:100,h:100});
  return result;
}
export function cellStyle(cell:Cell) {
  return `grid-area:${cell.y+1}/${cell.x+1}/${cell.y+cell.h+1}/${cell.x+cell.w+1};--edge-top:${cell.y===0?1:0};--edge-bottom:${cell.y+cell.h===100?1:0};--edge-left:${cell.x===0?1:0};--edge-right:${cell.x+cell.w===100?1:0}`;
}
