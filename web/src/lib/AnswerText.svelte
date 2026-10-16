<script lang="ts">
  import type { Source } from './api'
  let { text, sources, onopen }: { text: string; sources: Source[]; onopen: (source: Source) => void } = $props()
  const segments = $derived(text.split(/(\[[^\]]+\]|\*\*[^*]+\*\*)/g))
</script>

<div class="answer-text">{#each segments as segment}{@const index = segment.startsWith('[') ? sources.findIndex(s => s.id === segment.slice(1, -1)) : -1}{#if index >= 0}<button class="citation" onclick={() => onopen(sources[index])} aria-label={`Ver fuente ${index + 1}: ${sources[index].documento}`} title={sources[index].documento}>{index + 1}</button>{:else if segment.startsWith('**') && segment.endsWith('**')}<strong>{segment.slice(2, -2)}</strong>{:else}{segment}{/if}{/each}</div>
