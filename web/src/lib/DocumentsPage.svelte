<script lang="ts">
  import Icon from './Icon.svelte'
  import { errorMessage, formatDate, getDocuments, type DocumentItem, type Library } from './api'

  let { baseline, onmetadata, ondocument }: { baseline: Library | null; onmetadata: (library: Library) => void; ondocument: (document: DocumentItem) => void } = $props()
  let search = $state('')
  let topic = $state('')
  let date = $state('')
  let tab = $state<'dosier' | 'registro'>('dosier')
  let reload = $state(0)
  let result = $state<Library | null>(null)
  let loading = $state(true)
  let error = $state('')
  const themes = $derived([...new Set((baseline?.documentos ?? []).filter(d => d.tipo === 'dosier').flatMap(d => d.temas))].sort((a, b) => a.localeCompare(b, 'es')))
  const dates = $derived([...new Set((baseline?.documentos ?? []).filter(d => d.tipo === 'dosier').map(d => d.fecha))].sort())
  const totals = $derived(result?.totales ?? baseline?.totales)

  $effect(() => {
    const filters = { q: search, tema: tab === 'dosier' ? topic : '', fecha: tab === 'dosier' ? date : '', tipo: tab }
    void reload
    const controller = new AbortController()
    let active = true
    loading = true
    error = ''
    const timer = setTimeout(async () => {
      try {
        const data = await getDocuments(filters, controller.signal)
        if (active) { result = data; onmetadata(data) }
      } catch (reason) {
        if (active && !controller.signal.aborted) error = errorMessage(reason)
      } finally {
        if (active) loading = false
      }
    }, 250)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  })

  function reset() { search = ''; topic = ''; date = '' }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    tab = event.key === 'Home' ? 'dosier' : event.key === 'End' ? 'registro' : tab === 'dosier' ? 'registro' : 'dosier'
    document.getElementById(`tab-${tab}`)?.focus()
  }
</script>

<div class="page-heading"><div><p class="eyebrow">Una biblioteca, todas tus fuentes</p><h1>Tu biblioteca de prensa.</h1><p class="heading-description">Busca en la colección y comprueba qué información tiene el asistente.</p></div><button class="button" onclick={() => reload++} disabled={loading}><Icon name="refresh" size={16} />Actualizar</button></div>

<div class="library-body">
  <div class="library-stats">
    <div><span class="stat-icon"><Icon name="file" /></span><span><strong>{totals?.dosieres ?? '—'}</strong><small>dosieres preparados</small></span></div>
    <div><span class="stat-icon"><Icon name="book" /></span><span><strong>{totals?.recortes ?? '—'}</strong><small>recortes de prensa</small></span></div>
    <div><span class="stat-icon"><Icon name="check" /></span><span><strong>{totals?.noticias_distintas ?? '—'}</strong><small>noticias distintas</small></span></div>
  </div>

  <form class="library-toolbar" onsubmit={event => event.preventDefault()} role="search" aria-label="Buscar en la biblioteca">
    <label class="search-field"><span class="sr-only">Buscar documento, tema o identificador</span><Icon name="search" size={17} /><input type="search" bind:value={search} maxlength="200" placeholder="Buscar documento, tema o identificador…" id="library-search" /></label>
    <label><span class="sr-only">Filtrar por tema</span><select bind:value={topic} disabled={tab === 'registro'} id="topic-filter"><option value="">Todos los temas</option>{#each themes as theme}<option value={theme}>{theme}</option>{/each}</select></label>
    <label><span class="sr-only">Filtrar por fecha</span><select bind:value={date} disabled={tab === 'registro'} id="date-filter"><option value="">Todas las fechas</option>{#each dates as day}<option value={day}>{formatDate(day)}</option>{/each}</select></label>
    <button type="button" class="icon-button" onclick={reset} aria-label="Limpiar filtros" title="Limpiar filtros"><Icon name="refresh" size={17} /></button>
  </form>

  <div class="library-tabs" role="tablist" aria-label="Tipo de documento">
    <button id="tab-dosier" role="tab" aria-selected={tab === 'dosier'} aria-controls="documents-panel" tabindex={tab === 'dosier' ? 0 : -1} onclick={() => tab = 'dosier'} onkeydown={tabKey}>Dosieres<span>{totals?.dosieres ?? '—'}</span></button>
    <button id="tab-registro" role="tab" aria-selected={tab === 'registro'} aria-controls="documents-panel" tabindex={tab === 'registro' ? 0 : -1} onclick={() => tab = 'registro'} onkeydown={tabKey}>Registros<span>{totals?.registros ?? '—'}</span></button>
    <span class="result-count" role="status" aria-live="polite">{loading ? 'Buscando…' : error ? 'Consulta no disponible' : `${result?.total_resultados ?? 0} ${tab === 'dosier' ? 'dosieres' : 'registros'}`}</span>
  </div>

  <div id="documents-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading}>
    {#if error}
      <div class="error-panel" role="alert"><Icon name="alert" /><div><h2>No se ha podido cargar la biblioteca.</h2><p>{error}</p><button class="button" onclick={() => reload++}>Volver a intentar</button></div></div>
    {:else if loading && !result}
      <div class="table-skeleton" aria-label="Cargando documentos">{#each [1, 2, 3, 4] as row}<div><span></span><span></span><span></span></div>{/each}</div>
    {:else if result?.documentos.length}
      <div class="table-wrapper" class:updating={loading}><table><caption class="sr-only">Documentos disponibles en la biblioteca</caption><thead><tr><th scope="col">Documento</th><th scope="col">Fecha</th><th scope="col">Recortes</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Ver detalles</span></th></tr></thead><tbody>{#each result.documentos as doc (doc.id)}<tr><td><div class="document-cell"><span class="file-badge" aria-hidden="true">{doc.tipo === 'dosier' ? 'PDF' : 'REG'}</span><button class="document-name" onclick={() => ondocument(doc)}><strong>{doc.nombre}</strong><small>{doc.id}{doc.paginas ? ` · ${doc.paginas} páginas` : ' · Registro de análisis'}</small><span class="document-tags">{#each doc.temas.slice(0, 2) as theme}<span>{theme}</span>{/each}</span></button></div></td><td>{formatDate(doc.fecha)}</td><td>{doc.tipo === 'dosier' ? doc.recortes : '—'}</td><td><span class="prepared"><span class="dot"></span>Preparado</span></td><td><button class="icon-button" onclick={() => ondocument(doc)} aria-label={`Ver detalles de ${doc.nombre}`}><Icon name="arrow" size={16} /></button></td></tr>{/each}</tbody></table></div>
    {:else}
      <div class="empty-state"><span class="empty-icon"><Icon name="search" size={25} /></span><h2>No hay documentos con esos filtros.</h2><p>Prueba otro tema, fecha o término de búsqueda.</p><button class="button" onclick={reset}>Limpiar filtros</button></div>
    {/if}
  </div>
  <p class="table-note"><Icon name="info" size={15} />{#if totals}{totals.recortes} recortes · {totals.noticias_distintas} noticias distintas, agrupando las republicaciones.{:else}El listado se obtiene de la biblioteca del servidor.{/if}</p>
</div>
