<script lang="ts">
  import type { Topic } from './types';
  let { topic, index, visited = false, explore, read }: { topic: Topic; index: number; visited?: boolean; explore: (event: MouseEvent) => void; read: (event: MouseEvent) => void } = $props();
  let failed = $state(false);
</script>
<article class:dark={topic.dark} class:with-image={topic.image && !topic.dark && !failed} class="topic-card">
  {#if topic.image && !topic.dark && !failed}<img src={topic.image} alt="" loading="lazy" draggable="false" onerror={() => failed = true} />{/if}
  <div class="card-top"><span>{topic.category || 'A connected idea'}</span><span>{visited ? '↺' : String(index + 1).padStart(2, '0')}</span></div>
  <button class="explore-card" onclick={explore} aria-label={`Explore ${topic.title}`}>
    <h2>{topic.label || topic.title}</h2>
    <p>{topic.description}</p>
  </button>
  <div class="card-bottom"><button class="read-link" onclick={read} aria-label={`Read ${topic.title}`}>Read article <span>↗</span></button><span class="enter-arrow" aria-hidden="true">↘</span></div>
  {#if topic.dark}<div class="orbital" aria-hidden="true"><i></i><i></i><i></i></div>{/if}
</article>
