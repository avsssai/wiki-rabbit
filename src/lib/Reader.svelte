<script lang="ts">
  import { getArticle, articleUrl } from './wiki';
  import type { Article } from './types';
  let { title, close, explore, navigate }: {title:string;close:(event:MouseEvent)=>void;explore:(title:string,event:MouseEvent)=>void;navigate:(title:string)=>void} = $props();
  let article = $state<Article | null>(null), error = $state(''), loading = $state(true), retry = $state(0);
  $effect(() => {
    const current = title; retry;
    let active = true;
    loading = true; error = ''; article = null;
    getArticle(current).then(data => {if(active) article = data;}).catch(e => {if(active) error = e.message;}).finally(() => {if(active) loading = false;});
    return () => { active = false; };
  });
  function linkClick(e: MouseEvent) {
    if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-wiki-title]');
    if(a?.dataset.wikiTitle) { e.preventDefault(); navigate(a.dataset.wikiTitle); }
  }
</script>
<div class="reader-top"><span class="eyebrow">The reading room</span><button onclick={close} aria-label="Close article">Close ↗</button></div>
<h2 id="reader-title" tabindex="-1">{title}</h2>
<a class="source-link" href={articleUrl(title)} target="_blank" rel="noreferrer">From Wikipedia ↗</a>
<button class="reader-explore" onclick={(e) => explore(article?.title || title,e)}>Explore this topic <span>↘</span></button>
{#if loading}<p role="status">Loading article…</p>
{:else if error}<div role="alert"><p>{error}</p><button onclick={() => retry++}>Try again ↻</button></div>
{:else if article}
  <!-- Native links provide keyboard activation through click. -->
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="article-body" onclick={linkClick}>{@html article.html}</div>
  <footer class="article-credit">Adapted from <a href={article.url} target="_blank" rel="noreferrer">Wikipedia</a>, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. References and navigation omitted. Images retain their individual licenses; follow their source links for credits.</footer>
{/if}
