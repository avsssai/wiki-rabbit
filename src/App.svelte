<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TopicCard from './lib/TopicCard.svelte';
  import Reader from './lib/Reader.svelte';
  import { seeds } from './lib/topics';
  import { getArticle, getPreviews, searchArticles } from './lib/wiki';
  import { prioritize, tileSize, pack, cellStyle } from './lib/bento';
  import type { RoomVisit, Topic } from './lib/types';

  let rooms = $state<RoomVisit[]>([]), reader = $state<string | null>(null);
  let grid: HTMLElement, searchInput: HTMLInputElement;
  let canvasWidth=$state(1200), canvasHeight=$state(800), transitioning=$state(false);
  let reduced = false, transitionId = 0, cleanupMotion = () => {};
  let query = $state(''), results = $state<Topic[]>([]), searchLoading = $state(false), searchError = $state('');
  let previewError = $state(false), moreLoading = $state(false);
  let readOrigin: HTMLElement | null = null, readScroll = 0;
  let room = $derived(rooms[rooms.length - 1]);
  let depth = $derived(Math.max(0, rooms.length - 1));
  let seen = $derived(new Set(rooms.map(r => r.title)));
  let capacity=$derived(reader ? (canvasWidth<1024 ? 2 : 4) : canvasWidth<600 ? 4 : canvasHeight<500 ? 4 : 8);
  let page=$derived(Math.min(room?.page||0,Math.max(0,Math.ceil((room?.topics.length||0)/capacity)-1)));
  let visibleTopics=$derived(room?.topics.slice(page*capacity,(page+1)*capacity)||[]);
  let slots=$derived.by(()=>{
    const items:{key:string;weight:number}[]=[{key:'brand',weight:reader?1.5:2}];
    if(reader)items.push({key:'reader',weight:canvasWidth<1024?9:12});
    visibleTopics.forEach((t,i)=>items.push({key:t.title,weight:tileSize(t,page*capacity+i,room?.title||null)==='featured'?3:tileSize(t,page*capacity+i,room?.title||null)==='wide'?2:1.4}));
    if(!visibleTopics.length) {
      if(room?.status==='loading') for(let i=0;i<4;i++)items.push({key:`loading-${i}`,weight:i===0?3:1.4});
      else items.push({key:'message',weight:4});
    }
    items.push({key:'utility',weight:2});
    const cells=pack(items.map(i=>i.weight),canvasWidth,canvasHeight);
    return new Map(items.map((item,i)=>[item.key,cellStyle(cells[i])]));
  });
  function placement(key:string){return slots.get(key)||'';}
  async function turnPage(direction:number) {
    stopMotion();if(!room)return;
    const next=page+direction;
    if(next*capacity>=room.topics.length && room.loaded<room.links.length)await more();
    if(next>=0 && next*capacity<room.topics.length){room.page=next;await tick();persist();}
  }
  const makeRoom = (title: string | null): RoomVisit => ({id:crypto.randomUUID(),title,topics:title ? [] : seeds.map(t=>({...t})),links:[],loaded:title ? 0 : seeds.length,status:title ? 'loading' : 'ready',scrollY:0,page:0});
  function persist(push = false) {
    if (!room) return;
    room.scrollY = window.scrollY;
    const url = new URL(location.href);
    if (depth) url.searchParams.set('trail', JSON.stringify(rooms.map(r=>r.title))); else url.searchParams.delete('trail');
    history[push ? 'pushState' : 'replaceState'](JSON.parse(JSON.stringify({rooms})), '', url);
  }
  function topicElement(title?: string) {
    return [...(grid?.querySelectorAll<HTMLElement>('[data-title]') || [])].find(el=>el.dataset.title===title);
  }
  function stopMotion() { transitionId++;cleanupMotion();cleanupMotion=()=>{};transitioning=false; }
  // Keep the selected title readable while its boundary expands. Reveal the
  // next room only once the source tile has occupied the entire viewport.
  async function morph(from:DOMRect|undefined,to:DOMRect,color:string,keyboard=false,reverse=false,title='',commit?:()=>Promise<void>) {
    const token=transitionId;
    if(keyboard || !grid?.animate){await commit?.();return;}
    transitioning=true;
    const animations:Animation[]=[];
    const layer=document.createElement('div');layer.className='transition-surface';layer.setAttribute('aria-hidden','true');
    layer.style.background=color;
    const heading=document.createElement('div');heading.className='transition-title';heading.textContent=title;
    heading.style.color=color.includes('39, 40, 35')?'#f6f5f0':'#242424';layer.append(heading);
    document.body.append(layer);
    const clean=()=>{animations.forEach(a=>a.cancel());layer.remove();};cleanupMotion=clean;
    const bounds=grid.getBoundingClientRect();
    const clip=(r:DOMRect)=>`inset(${Math.max(0,r.top)}px ${Math.max(0,bounds.right-r.right)}px ${Math.max(0,bounds.bottom-r.bottom)}px ${Math.max(0,r.left)}px)`;
    const center=(r:DOMRect)=>({x:r.left+r.width/2,y:r.top+r.height/2});
    const start=center(from||to),end=center(to);
    if(!reduced && from){
      animations.push(layer.animate([{clipPath:clip(from)},{clipPath:clip(to)}],{duration:620,easing:'cubic-bezier(.77,0,.175,1)',fill:'both'}));
      animations.push(heading.animate([{transform:`translate(${start.x}px,${start.y}px) translate(-50%,-50%)`,opacity:.6},{transform:`translate(${end.x}px,${end.y}px) translate(-50%,-50%)`,opacity:1}],{duration:620,easing:'cubic-bezier(.77,0,.175,1)',fill:'both'}));
      await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
    } else {layer.style.opacity='0';}
    if(token!==transitionId){clean();return;}
    await commit?.();
    if(token!==transitionId){clean();return;}
    const fade=layer.animate([{opacity:reduced?0:1},{opacity:0}],{duration:reduced?120:180,fill:'both'});animations.push(fade);
    await fade.finished.catch(()=>{});clean();
    if(token===transitionId){cleanupMotion=()=>{};transitioning=false;}
  }
  function screenRect() {return grid.getBoundingClientRect();}
  async function hydrateRoot() {
    previewError=false;
    try {
      const previews=await getPreviews(seeds.map(t=>t.title));
      const root=rooms.find(r=>r.title===null);
      if(root) root.topics=seeds.map(seed=>({...seed,image:previews.find(p=>p.title===seed.title)?.image,imageName:previews.find(p=>p.title===seed.title)?.imageName}));
    } catch {previewError=true;}
  }
  async function populate(id: string) {
    let target=rooms.find(r=>r.id===id);if(!target?.title)return;
    const title=target.title;target.status='loading';target.error=undefined;
    try {
      const article=await getArticle(title);
      target=rooms.find(r=>r.id===id);if(!target)return;
      target.description=article.description;target.links=article.links;target.loaded=Math.min(12,article.links.length);
      target.topics=prioritize(article.links.slice(0,12).map(title=>({title,description:'Follow the thread. Discover the connection.'})),title);
      target.status='ready';
      try {
        const previews=await getPreviews(article.links.slice(0,12));
        target=rooms.find(r=>r.id===id);
        if(target) target.topics=target.topics.map(t=>({...t,...previews.find(p=>p.title===t.title),importance:t.importance}));
      } catch { /* Keep usable connections when previews fail. */ }
    } catch(e) {target=rooms.find(r=>r.id===id);if(target){target.status='error';target.error=e instanceof Error?e.message:'Unable to load connections.';}}
    persist();
  }
  async function enter(title: string, source?: HTMLElement | null, keyboard = false) {
    stopMotion();const token=transitionId;
    const origin=source?.closest<HTMLElement>('.bento-tile') || topicElement(title);
    const rect=origin?.getBoundingClientRect();
    const color=origin ? getComputedStyle(origin).backgroundColor : '#f9f8f4';
    if(room){room.focusTitle=title;persist();}
    const next=makeRoom(title);
    void getArticle(title).catch(()=>{});
    await morph(rect,screenRect(),color,keyboard,false,title,async()=>{
      reader=null;query='';moreLoading=false;rooms=[...rooms,next];
      await tick();persist(true);void populate(next.id);
    });
    if(token===transitionId) document.getElementById('room-heading')?.focus({preventScroll:true});
  }
  async function up(level=rooms.length-2, keyboard=false) {
    if(level<0 || level>=rooms.length-1)return;
    stopMotion();const token=transitionId;
    const from=screenRect();persist();reader=null;moreLoading=false;
    const parent=rooms[level], scroll=parent.scrollY;
    rooms=rooms.slice(0,level+1);
    await tick();window.scrollTo(0,scroll);
    const target=topicElement(parent.focusTitle);
    persist(true);
    await morph(from,target?.getBoundingClientRect() || screenRect(),'#f9f8f4',keyboard,true,parent.focusTitle||'wiki rabbit.');
    if(token===transitionId) target?.querySelector<HTMLButtonElement>('.explore-card')?.focus({preventScroll:true});
  }
  async function openReader(title:string, source?:HTMLElement, keyboard=false) {
    stopMotion();const token=transitionId;
    readOrigin=source || document.activeElement as HTMLElement;readScroll=window.scrollY;
    const rect=readOrigin?.closest('.bento-tile')?.getBoundingClientRect();
    reader=title;await tick();
    const tile=document.querySelector<HTMLElement>('.reading-tile');tile?.scrollIntoView({block:'start'});
    if(tile) await morph(rect,tile.getBoundingClientRect(),'#faf9f6',keyboard,false,title);
    if(token===transitionId) document.getElementById('reader-title')?.focus({preventScroll:true});
  }
  async function closeReader(keyboard=false) {
    stopMotion();const token=transitionId;
    const from=document.querySelector('.reading-tile')?.getBoundingClientRect();
    reader=null;await tick();window.scrollTo(0,readScroll);
    const destination=readOrigin?.closest('.bento-tile')?.getBoundingClientRect();
    if(destination) await morph(from,destination,'#faf9f6',keyboard,true,readOrigin?.closest('.bento-tile')?.getAttribute('data-title')||'');
    if(token!==transitionId)return;
    if(readOrigin?.isConnected) readOrigin.focus({preventScroll:true}); else document.getElementById('room-heading')?.focus({preventScroll:true});
  }
  async function navigateReader(title:string) {reader=title;await tick();document.getElementById('reader-title')?.focus();}
  async function more() {
    if(!room || moreLoading)return;
    const id=room.id, titles=room.links.slice(room.loaded,room.loaded+12);moreLoading=true;room.error=undefined;
    try {
      const previews=await getPreviews(titles),target=rooms.find(r=>r.id===id);
      if(target){const existing=new Set(target.topics.map(t=>t.title));target.topics=[...target.topics,...prioritize(titles.map(title=>previews.find(t=>t.title===title)||{title,description:'Follow this connection.'}),target.title!).filter(t=>!existing.has(t.title))];target.loaded+=titles.length;}
    } catch {const target=rooms.find(r=>r.id===id);if(target)target.error='Could not load more connections. Try again.';}
    if(room?.id===id){moreLoading=false;persist();}
  }
  function surprise(e:MouseEvent) {const candidates=room?.topics.filter(t=>!seen.has(t.title))||[];if(candidates.length){const t=candidates[Math.floor(Math.random()*candidates.length)];void enter(t.title,topicElement(t.title),e.detail===0);}}
  $effect(()=>{
    const text=query.trim();let active=true;const controller=new AbortController();results=[];searchError='';searchLoading=!!text;
    const timer=setTimeout(async()=>{if(!text)return;try{const found=await searchArticles(text,controller.signal);if(active)results=found;}catch{if(active&&!controller.signal.aborted)searchError='Search is unavailable. Please try again.';}finally{if(active)searchLoading=false;}},250);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  });
  function key(e:KeyboardEvent) {
    if(e.key==='Escape'){if(transitioning){stopMotion();return;}if(query)query='';else if(reader)void closeReader(true);else void up(undefined,true);}
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();searchInput?.focus();}
  }
  onMount(()=>{
    const mq=matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>reduced=mq.matches;motion();mq.addEventListener('change',motion);
    const restore=async()=>{
      stopMotion();reader=null;query='';moreLoading=false;
      if(history.state?.rooms?.length) rooms=history.state.rooms.map((r:RoomVisit)=>({...r,scrollY:r.scrollY||0}));
      else {
        rooms=[makeRoom(null)];
        try {const trail=JSON.parse(new URL(location.href).searchParams.get('trail')||'[]');if(Array.isArray(trail))for(const title of trail.slice(0,50))if(typeof title==='string'&&title.length&&title.length<300)rooms.push(makeRoom(title));}catch{/* Invalid trails start at home. */}
      }
      const scroll=room?.scrollY||0;
      await tick();window.scrollTo(0,scroll);persist();
      rooms.filter(r=>r.status==='loading').forEach(r=>void populate(r.id));void hydrateRoot();
    };
    const observer=new ResizeObserver(([entry])=>{stopMotion();canvasWidth=entry.contentRect.width;canvasHeight=entry.contentRect.height;});observer.observe(grid);
    const oldRestoration=history.scrollRestoration;history.scrollRestoration='manual';
    void restore();
    let timer:ReturnType<typeof setTimeout>;
    const scroll=()=>{clearTimeout(timer);timer=setTimeout(()=>persist(),100);};
    const pop=()=>{clearTimeout(timer);void restore();};
    window.addEventListener('popstate',pop);window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',stopMotion);
    return()=>{observer.disconnect();stopMotion();clearTimeout(timer);mq.removeEventListener('change',motion);window.removeEventListener('popstate',pop);window.removeEventListener('scroll',scroll);window.removeEventListener('resize',stopMotion);history.scrollRestoration=oldRestoration;};
  });
</script>
<svelte:window onkeydown={key}/>
<main class="bento" class:reader-open={!!reader} bind:this={grid} aria-label="Topic grid" inert={transitioning}>
  <section class="bento-tile brand-tile" style={placement('brand')} inert={!!reader && canvasWidth<760}>
    <button class="brand" onclick={(e)=>depth ? up(0,e.detail===0) : (room.page=0)} aria-label="Wiki Rabbit home">wiki rabbit<span>.</span></button>
    <div class="brand-bottom"><span class="eyebrow">{depth?`Below the surface / ${String(depth).padStart(2,'0')}`:'An atlas for the curious'}</span><span class="brand-symbol" aria-hidden="true">◎</span></div>
    <h1 id="room-heading" tabindex="-1">{depth?room?.title:'One thing leads to another.'}</h1>
    {#if depth}<nav aria-label="Exploration trail"><button onclick={(e)=>up(undefined,e.detail===0)} aria-label="Up one level">↖ Back</button><button onclick={(e)=>up(0,e.detail===0)}>The surface</button></nav><button class="text-action" onclick={(e)=>openReader(room.title!,e.currentTarget,e.detail===0)}>Read article ↗</button>{:else}<p class="brand-note">Pick a thread.<br/>See how far it goes.</p>{/if}
  </section>
  {#if reader}<section class="bento-tile reading-tile" style={placement('reader')} aria-labelledby="reader-title" role={canvasWidth<760?'dialog':undefined} aria-modal={canvasWidth<760?true:undefined}><Reader title={reader} close={(e)=>closeReader(e.detail===0)} explore={(title,e)=>enter(title,document.querySelector<HTMLElement>('.reading-tile'),e.detail===0)} navigate={navigateReader}/></section>{/if}
  {#if room}
    {#each visibleTopics as topic,index (topic.title)}
      <div class={`bento-tile topic-tile ${tileSize(topic,page*capacity+index,room.title)}`} style={placement(topic.title)} class:dark={topic.dark} data-title={topic.title} inert={!!reader && canvasWidth<760}>
        <TopicCard {topic} index={page*capacity+index} visited={seen.has(topic.title)} explore={(e)=>enter(topic.title,e.currentTarget as HTMLElement,e.detail===0)} read={(e)=>openReader(topic.title,e.currentTarget as HTMLElement,e.detail===0)}/>
        {#if topic.imageName}<a class="image-credit" href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(topic.imageName)}`} target="_blank" rel="noreferrer" aria-label={`Image source for ${topic.title}`}>Image source ↗</a>{/if}
      </div>
    {/each}
    {#if room.status==='loading'&&!visibleTopics.length}{#each Array(4) as _,i}<div class="bento-tile skeleton-card" style={placement(`loading-${i}`)} aria-hidden="true"><span class="eyebrow">Following the thread</span><div></div><div></div></div>{/each}{/if}
    {#if room.status==='error'}<section class="bento-tile message-tile" style={placement('message')} role="alert" inert={!!reader && canvasWidth<760}><h2>The thread slipped.</h2><p>{room.error}</p><button onclick={()=>populate(room.id)}>Try again ↻</button></section>
    {:else if room.status==='ready'&&!room.topics.length}<section class="bento-tile message-tile" style={placement('message')} inert={!!reader && canvasWidth<760}><h2>A quiet corner.</h2><p>This article has no more connections to follow.</p><button onclick={(e)=>up(undefined,e.detail===0)}>Follow another thread ↖</button></section>{/if}
  {/if}
  <section class="bento-tile utility-tile" style={placement('utility')} inert={!!reader && canvasWidth<760}>
    <label class="eyebrow" for="topic-search">Follow your curiosity</label>
    <div class="search-field"><input id="topic-search" bind:this={searchInput} bind:value={query} placeholder="Search Wikipedia" enterkeyhint="search" onkeydown={(e)=>{if(e.key==='Enter'&&results[0])void enter(results[0].title,undefined,true);}}/><span aria-hidden="true">⌕</span></div>
    {#if query.trim()}<div class="search-results" aria-label="Search results" aria-busy={searchLoading}>{#if searchLoading}<p role="status">Searching Wikipedia…</p>{/if}{#each results as result}<button onclick={(e)=>enter(result.title,e.currentTarget,e.detail===0)}><strong>{result.title}</strong><span>{result.description}</span></button>{/each}{#if searchError}<p role="alert">{searchError}</p>{:else if !searchLoading&&!results.length}<p>No articles found. Try another phrase.</p>{/if}</div>
    {:else}<button class="surprise-button" onclick={surprise} disabled={!room?.topics.length}>Surprise me <span>↗</span></button>{/if}
    <div class="pagination"><button onclick={()=>turnPage(-1)} disabled={page===0} aria-label="Previous topics">←</button><span>{page+1} / {Math.max(1,Math.ceil((room?.topics.length||0)/capacity))}{room&&room.loaded<room.links.length?' +':''}</span><button onclick={()=>turnPage(1)} disabled={moreLoading || !room || ((page+1)*capacity>=room.topics.length && room.loaded>=room.links.length)} aria-label="Next topics">{moreLoading?'…':'→'}</button></div>
    {#if room?.error&&room.topics.length}<p role="alert">{room.error}</p>{/if}
    <a class="wiki-credit" href="https://en.wikipedia.org" target="_blank" rel="noreferrer">Via Wikipedia ↗</a>
    {#if previewError}<button class="retry-images" onclick={hydrateRoot}>Retry images ↻</button>{/if}
  </section>
</main>
<div class="sr-only" aria-live="polite">{room?.status==='loading'?'Loading connections':`${room?.title||'The surface'}. Page ${page+1}. ${visibleTopics.length} topics. Depth ${depth}.`}</div>
