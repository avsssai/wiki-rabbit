import { describe, expect, it } from 'vitest';
import { extractArticle, internalTitle } from '../src/lib/wiki';
import { tileSize, prioritize, pack } from '../src/lib/bento';

describe('Wikipedia connections', () => {
  it('keeps article-body links in order while dropping references and navigation', () => {
    const parsed = extractArticle(`
      <p>One <a href="/wiki/Roman_Empire">empire</a> meets <a href="/wiki/Cold_War">another era</a>.</p>
      <p><a href="/wiki/Roman_Empire">Same empire</a> and <a href="/wiki/File:Map.jpg">a file</a>.</p>
      <div class="reflist"><a href="/wiki/Fake_source">Source</a></div>
      <h2>References</h2><ul><li><a href="/wiki/Fake_citation">Citation</a></li></ul>
    `);
    expect(parsed.links).toEqual(['Roman Empire', 'Cold War']);
    expect(parsed.html).not.toContain('Fake_citation');
  });

  it('accepts only English Wikipedia article links', () => {
    expect(internalTitle('/wiki/World_War_II')).toBe('World War II');
    expect(internalTitle('https://en.wikipedia.org/wiki/Cold_War')).toBe('Cold War');
    expect(internalTitle('/wiki/Category:History')).toBeNull();
    expect(internalTitle('https://example.com/wiki/World_War_II')).toBeNull();
  });
});

describe('bento sizing', () => {
  it('keeps seed importance stable when preview text changes', () => {
    const topic = {title:'World War II',description:'Short',importance:'featured'};
    expect(tileSize(topic,0,null)).toBe('featured');
    expect(tileSize({...topic,description:'Long '.repeat(200),image:'photo.jpg'},0,null)).toBe('featured');
  });
  it('uses editorial priorities for connections and a deterministic fallback', () => {
    const topics=prioritize(['Manhattan Project','Adolf Hitler','Unknown'].map(title=>({title,description:''})),'World War II');
    expect(topics.map((t,i)=>tileSize(t,i,'World War II'))).toEqual(['featured','wide','standard']);
    expect(tileSize(topics[2],0,'Uncurated topic')).toBe('wide');
    expect(tileSize(topics[2],2,'Uncurated topic')).toBe('standard');
  });
});


describe('viewport partition',()=>{
  it('covers the entire viewport without overlap for every supported tile count',()=>{
    for(const [width,height] of [[390,844],[1440,900],[844,390]])for(let count=2;count<=12;count++){
      const cells=pack(Array.from({length:count},(_,i)=>i%3+1),width,height);
      expect(cells.reduce((sum,c)=>sum+c.w*c.h,0)).toBe(10000);
      expect(cells.every(c=>c.w>0&&c.h>0&&c.x>=0&&c.y>=0&&c.x+c.w<=100&&c.y+c.h<=100)).toBe(true);
      cells.forEach((a,i)=>cells.slice(i+1).forEach(b=>expect(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)).toBe(false)));
    }
  });
});
