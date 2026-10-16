<script lang="ts">
  import type { Source } from './api'
  import { formatDate } from './api'
  import Icon from './Icon.svelte'
  let { source, index, onopen }: { source: Source; index?: number; onopen: (source: Source) => void } = $props()
</script>

<button class="source-card" onclick={() => onopen(source)} aria-label={`Abrir fuente: ${source.documento}${source.pagina ? ', página ' + source.pagina : ''}`}>
  <span class="source-card-head"><Icon name={source.tipo === 'registro' ? 'grid' : 'file'} size={15} />{#if index !== undefined}<span class="source-number">{index + 1}</span>{/if}<strong>{source.documento}</strong><span class="source-page">{source.pagina ? `p. ${source.pagina}` : 'Registro'}</span></span>
  <q class="source-quote">{source.fragmento}</q>
  <span class="source-card-foot"><span>{formatDate(source.fecha)}{source.funcion === 'cobertura' ? ' · Alcance documental' : ''}</span><Icon name="arrow" size={13} /></span>
</button>
