import DOMPurify from 'dompurify';
import type { Article, Topic } from './types';
import { priorities } from './topics';
const endpoint = 'https://en.wikipedia.org/w/api.php';
const articles = new Map<string, Article>();
const pending = new Map<string, Promise<Article>>();
const previews = new Map<string, Topic>();
export const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
async function request(params: Record<string, string>, signal?: AbortSignal) {
  const response = await fetch(`${endpoint}?${new URLSearchParams({format:'json',formatversion:'2',origin:'*', ...params})}`, {signal: signal ?? AbortSignal.timeout(18000)});
  if (!response.ok) throw new Error('Wikipedia is taking a moment. Please try again.');
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || 'This article could not be loaded.');
  return data;
}
export function extractArticle(raw: string) {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('.reference, .references, .reflist, .navbox, .vertical-navbox, .sidebar, .infobox, .metadata, .ambox, .mw-editsection, .noprint, .hatnote, .toc, .catlinks, .sistersitebox, style, script, link, form, iframe, input, button').forEach(el => el.remove());
  for (const heading of [...doc.querySelectorAll('h2, h3')]) {
    if (/^(references|notes|footnotes|citations|bibliography|external links|further reading|sources)$/i.test(heading.textContent?.trim() || '')) {
      const parent = heading.parentElement?.classList.contains('mw-heading') ? heading.parentElement : heading;
      let next = parent.nextElementSibling;
      while (next && !next.matches('h2, h3, .mw-heading')) { const after = next.nextElementSibling; next.remove(); next = after; }
      parent.remove();
    }
  }
  const links: string[] = [];
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('p a[href], li a[href]')) {
    const title = internalTitle(a.getAttribute('href') || '');
    if (title && !a.classList.contains('new') && !links.includes(title)) links.push(title);
  }
  doc.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const title = internalTitle(href);
    if (title) { a.setAttribute('href', articleUrl(title)); a.setAttribute('data-wiki-title', title); }
    else if (href.startsWith('//')) a.setAttribute('href', `https:${href}`);
    if (!title && !href.startsWith('#')) { a.setAttribute('target','_blank'); a.setAttribute('rel','noopener noreferrer'); }
  });
  doc.querySelectorAll('img').forEach(img => {
    if (img.getAttribute('src')?.startsWith('//')) img.setAttribute('src', `https:${img.getAttribute('src')}`);
    img.removeAttribute('srcset'); img.setAttribute('loading','lazy');
  });
  const html = DOMPurify.sanitize(doc.body.innerHTML, {ADD_ATTR:['target','data-wiki-title'], FORBID_TAGS:['style','form','input','button'], FORBID_ATTR:['style']});
  const description = doc.querySelector('p:not(:empty)')?.textContent?.trim().slice(0, 260) || '';
  return {html, links, description};
}
export function internalTitle(href: string): string | null {
  try {
    const url = new URL(href, 'https://en.wikipedia.org');
    if (url.hostname !== 'en.wikipedia.org' || !url.pathname.startsWith('/wiki/') || href.startsWith('#')) return null;
    const title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_',' ');
    if (!title || /^(File|Image|Category|Help|Wikipedia|Template|Special|Portal|Talk|User|Media|Module)( talk)?:/i.test(title) || url.searchParams.has('redlink')) return null;
    return title;
  } catch { return null; }
}
export async function getArticle(title: string): Promise<Article> {
  if (articles.has(title)) return articles.get(title)!;
  if (pending.has(title)) return pending.get(title)!;
  const task = (async () => {
    const data = await request({action:'parse',page:title,prop:'text',redirects:'1',disableeditsection:'1'});
    const parsed = extractArticle(data.parse.text);
    const canonical = data.parse.title;
    const preferred = priorities[canonical] || priorities[title] || [];
    const links = parsed.links.filter(x => x !== canonical);
    links.sort((a,b) => { const ai = preferred.indexOf(a), bi = preferred.indexOf(b); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
    const article: Article = {...parsed, title:canonical, pageid:data.parse.pageid, links, url:articleUrl(canonical)};
    articles.set(title, article); articles.set(canonical, article);
    return article;
  })();
  pending.set(title, task);
  try { return await task; } finally { pending.delete(title); }
}
export async function getPreviews(titles: string[]): Promise<Topic[]> {
  const missing = titles.filter(title => !previews.has(title));
  for (let start = 0; start < missing.length; start += 24) {
    const chunk = missing.slice(start, start + 24);
    const data = await request({action:'query',titles:chunk.join('|'),redirects:'1',prop:'extracts|pageimages',exintro:'1',explaintext:'1',exsentences:'2',piprop:'thumbnail|name',pithumbsize:'600',pilimit:'max',pilicense:'free'});
    const aliases = new Map<string,string>();
    for (const item of [...(data.query.normalized || []), ...(data.query.redirects || [])]) aliases.set(item.from,item.to);
    for (const title of chunk) {
      let canonical = title;
      for(let i=0; i<5 && aliases.has(canonical); i++) canonical = aliases.get(canonical)!;
      const page = data.query.pages.find((p: {title:string}) => p.title === canonical);
      if (page && !page.missing) previews.set(title, {title:page.title,pageid:page.pageid,description:page.extract || 'Follow this connection and see where it leads.',image:page.thumbnail?.source,imageName:page.pageimage});
    }
  }
  const seen = new Set<string>();
  return titles.flatMap(title => {
    const topic = previews.get(title);
    if (!topic || seen.has(topic.title)) return [];
    seen.add(topic.title);
    return [topic];
  });
}
export async function searchArticles(query: string, signal: AbortSignal): Promise<Topic[]> {
  const data = await request({action:'query',list:'search',srsearch:query,srlimit:'8',srnamespace:'0'},signal);
  return data.query.search.map((r: {title:string; snippet:string; pageid:number}) => ({title:r.title,pageid:r.pageid,description:r.snippet.replace(/<[^>]*>/g,'')}));
}
