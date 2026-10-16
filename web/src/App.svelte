<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Icon from './lib/Icon.svelte'
  import AnswerText from './lib/AnswerText.svelte'
  import SourceCard from './lib/SourceCard.svelte'
  import DocumentsPage from './lib/DocumentsPage.svelte'
  import SourcePage from './lib/SourcePage.svelte'
  import { ask, errorMessage, formatDate, getDocuments, type Answer, type DocumentItem, type Library, type Message, type Source } from './lib/api'

  type Page = 'chat' | 'documentos' | 'fuente'
  interface Turn { id: number; question: string; answer: Answer | null; error: string; pending: boolean; time: string }
  let page = $state<Page>('chat')
  let library = $state<Library | null>(null)
  let libraryError = $state('')
  let libraryLoading = $state(true)
  let turns = $state<Turn[]>([])
  let draft = $state('')
  let busy = $state(false)
  let selectedSource = $state<Source | null>(null)
  let sourceTurnId = $state<number | null>(null)
  let sourceReturn = $state<Page>('chat')
  let selectedDocument = $state<DocumentItem | null>(null)
  let notification = $state('')
  let composer: HTMLTextAreaElement | undefined
  let documentDialog: HTMLDialogElement | undefined
  let sequence = 0
  let activeRequest: AbortController | undefined
  let libraryRequest: AbortController | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const suggestions = [
    { title: 'Menciones a la Junta', description: 'Cuántas noticias mencionan a la institución', icon: 'chat', question: '¿En cuántas noticias se menciona a la Junta de Castilla y León?' },
    { title: 'Sector de automoción', description: 'Noticias sobre industria y movilidad', icon: 'search', question: '¿Existen noticias relacionadas con la automoción?' },
    { title: 'Perspectivas económicas', description: 'Previsiones regionales, nacionales y mundiales', icon: 'grid', question: '¿Qué previsión hay sobre la economía regional, nacional e internacional?' },
    { title: 'Un dato histórico', description: 'Comprobar los límites de la biblioteca', icon: 'calendar', question: '¿Cuál fue la tasa de paro en 1980?' },
  ]
  const sourceQuestion = $derived(turns.find(t => t.id === sourceTurnId)?.question)
  const sourceDocument = $derived(library?.documentos.find(d => d.id === selectedSource?.documento_id))
  const documentSources = $derived.by(() => {
    const found = new Map<string, Source>()
    for (const turn of turns) for (const source of turn.answer?.fuentes ?? []) {
      if (source.documento_id === selectedDocument?.id) found.set(source.id, source)
    }
    return [...found.values()]
  })

  function navigate(next: Page) { page = next; window.location.hash = '/' + next; window.scrollTo({ top: 0, behavior: 'instant' }) }
  function readRoute() { const route = window.location.hash.replace(/^#\/?/, ''); const previous = page; page = route === 'documentos' || route === 'fuente' ? route : 'chat'; if (page !== previous) window.scrollTo({ top: 0, behavior: 'instant' }) }

  async function loadLibrary() {
    libraryRequest?.abort()
    libraryRequest = new AbortController()
    const controller = libraryRequest
    libraryLoading = true
    libraryError = ''
    try { library = await getDocuments({}, controller.signal) }
    catch (error) { if (!controller.signal.aborted) libraryError = errorMessage(error) }
    finally { if (!controller.signal.aborted) libraryLoading = false }
  }

  function updateMetadata(data: Library) {
    library = library ? { ...library, totales: data.totales, fecha_desde: data.fecha_desde, fecha_hasta: data.fecha_hasta, datos_demostracion: data.datos_demostracion } : data
    libraryError = ''
  }

  onMount(() => {
    readRoute()
    window.addEventListener('hashchange', readRoute)
    void loadLibrary()
    return () => { window.removeEventListener('hashchange', readRoute); activeRequest?.abort(); libraryRequest?.abort(); clearTimeout(toastTimer) }
  })

  async function focusComposer() { await tick(); resizeComposer(); composer?.focus() }
  async function goToTurn(id: number) { navigate('chat'); await tick(); document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  function resizeComposer() { if (composer) { composer.style.height = 'auto'; composer.style.height = Math.min(composer.scrollHeight, 140) + 'px' } }
  function notify(message: string) { notification = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => notification = '', 4000) }

  async function copyText(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text)
      else {
        const field = document.createElement('textarea'); field.value = text; field.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
        document.body.append(field); field.select(); const success = document.execCommand('copy'); field.remove()
        if (!success) throw new Error('Clipboard unavailable')
      }
      notify('Texto copiado al portapapeles.')
    } catch { notify('No se ha podido copiar. Puedes seleccionar el texto manualmente.') }
  }

  function openSource(source: Source, turnId: number | null = null, returnPage: Page = 'chat') {
    documentDialog?.close()
    selectedSource = source; sourceTurnId = turnId; sourceReturn = returnPage
    navigate('fuente')
  }

  function returnFromSource() { if (sourceReturn === 'chat' && sourceTurnId !== null) void goToTurn(sourceTurnId); else navigate(sourceReturn) }
  function copySource() { if (selectedSource) void copyText(`${selectedSource.documento}${selectedSource.pagina ? ' · Página ' + selectedSource.pagina : ''}\n${selectedSource.id}\n«${selectedSource.fragmento}»${selectedSource.simulada ? '\nFuente de demostración.' : ''}`) }
  async function openDocument(doc: DocumentItem) { selectedDocument = doc; await tick(); documentDialog?.showModal() }

  async function finishTurn(id: number, update: Partial<Turn>) {
    const bounds = document.getElementById(`turn-${id}`)?.getBoundingClientRect()
    const follow = page === 'chat' && bounds && bounds.top < window.innerHeight && bounds.bottom > 80
    turns = turns.map(t => t.id === id ? { ...t, ...update } : t)
    await tick()
    if (follow && page === 'chat') document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function runTurn(id: number) {
    const index = turns.findIndex(t => t.id === id)
    if (busy || index < 0) return
    const turn = turns[index]
    const history: Message[] = turns.slice(0, index).filter(t => t.answer).flatMap(t => [{ rol: 'user' as const, contenido: t.question }, { rol: 'assistant' as const, contenido: t.answer!.respuesta }])
    busy = true
    turns = turns.map(t => t.id === id ? { ...t, pending: true, error: '' } : t)
    activeRequest = new AbortController()
    try {
      const answer = await ask(turn.question, history, activeRequest.signal)
      await finishTurn(id, { answer, pending: false })
    } catch (error) {
      await finishTurn(id, { pending: false, error: errorMessage(error) })
    } finally { busy = false; activeRequest = undefined }
  }

  async function sendQuestion(question: string) {
    const text = question.trim()
    if (!text || busy || text.length > 2000) return
    const id = ++sequence
    turns = [...turns, { id, question: text, answer: null, pending: false, error: '', time: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date()) }]
    draft = ''
    navigate('chat')
    await tick(); resizeComposer()
    document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    await runTurn(id)
  }

  function retry(turn: Turn) { if (turns.at(-1)?.id === turn.id) void runTurn(turn.id); else void sendQuestion(turn.question) }
  function newConversation() {
    if (busy) return
    turns = []; selectedSource = null; sourceTurnId = null; draft = ''; navigate('chat'); void focusComposer()
  }
  function composerKey(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendQuestion(draft) } }
</script>

<svelte:head><title>{page === 'documentos' ? 'Biblioteca' : page === 'fuente' ? 'Detalle de fuente' : 'Conversación'} · Dosier</title><meta name="description" content="Consulta los dosieres de prensa de Economía y Hacienda, con respuestas respaldadas por sus fuentes." /></svelte:head>

<a href="#main-content" class="skip-link" onclick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Saltar al contenido</a>
<div class="app-shell">
  <aside class="sidebar" aria-label="Navegación principal">
    <a class="brand" href="#/chat" aria-label="Dosier, inicio"><span class="brand-mark" aria-hidden="true">d.</span><span>dosier</span></a>
    <div class="workspace-label">Espacio de trabajo<strong>Economía y Hacienda</strong><span>Junta de Castilla y León</span></div>
    <nav class="side-nav"><a href="#/chat" class:active={page === 'chat'} aria-current={page === 'chat' ? 'page' : undefined}><Icon name="chat" /><span>Conversación</span></a><a href="#/documentos" class:active={page === 'documentos'} aria-current={page === 'documentos' ? 'page' : undefined}><Icon name="file" /><span>Documentos</span>{#if library}<span class="nav-count">{library.totales.dosieres}</span>{/if}</a><a href="#/fuente" class:active={page === 'fuente'} aria-current={page === 'fuente' ? 'page' : undefined}><Icon name="link" /><span>Trazabilidad</span></a></nav>
    <div class="sidebar-conversation"><div class="side-rule"></div><p class="side-heading">En esta conversación</p>{#if turns.length}{#each turns.slice(-4) as turn (turn.id)}<button class="saved-query" onclick={() => goToTurn(turn.id)} title={turn.question}><span></span><span class="saved-query-label">{turn.question}</span></button>{/each}{:else}<p class="sidebar-hint">Tus consultas aparecerán aquí.</p>{/if}</div>
    <div class="sidebar-bottom"><p class:offline={!!libraryError} class="library-status"><span class="dot"></span>{libraryError ? 'Biblioteca sin conexión' : library ? 'Biblioteca preparada' : 'Conectando con la biblioteca'}</p>{#if library}<p>{library.totales.dosieres} dosieres · {library.totales.noticias_distintas} noticias distintas</p><p>{formatDate(library.fecha_desde)} – {formatDate(library.fecha_hasta)}</p>{/if}<a href="#/documentos">Consultar cobertura<Icon name="arrow" size={13} /></a></div>
  </aside>

  <main class="main" id="main-content" tabindex="-1">
    <header class="topbar"><div class="breadcrumb"><span>Mi espacio</span><Icon name="chevron" size={13} /><strong>{page === 'documentos' ? 'Documentos' : page === 'fuente' ? 'Detalle de fuente' : 'Conversación'}</strong></div><div class="topbar-right">{#if library?.datos_demostracion}<span class="pill rose"><span class="dot"></span>Datos de demostración</span>{:else if libraryError}<span class="pill neutral">Sin conexión</span>{:else if libraryLoading}<span class="pill neutral">Conectando…</span>{/if}<span class="avatar" aria-label="Espacio de Economía y Hacienda">EH</span></div></header>
    {#if library?.datos_demostracion}<div class="demo-notice"><Icon name="info" size={14} /><span>Estás consultando una colección ficticia de demostración. Las cifras y los fragmentos no representan prensa real.</span></div>{/if}

    <section class="page chat-page" hidden={page !== 'chat'} aria-label="Conversación">
      <div class="page-heading"><div><p class="eyebrow">La actualidad, con sus fuentes</p><h1>Consulta la actualidad.</h1><p class="heading-description">Pregunta sobre tus dosieres. Cada respuesta empieza en una fuente.</p><div class="scope-strip">{#if library}<span class="pill"><Icon name="calendar" size={14} />{formatDate(library.fecha_desde)} – {formatDate(library.fecha_hasta)}</span><a class="pill scope-link" href="#/documentos"><Icon name="file" size={14} />{library.totales.dosieres} dosieres</a><span>{library.totales.noticias_distintas} noticias distintas · {library.totales.registros} registros de análisis</span>{:else}<span>{libraryError ? 'Biblioteca no disponible' : 'Cargando el alcance de la biblioteca…'}</span>{/if}</div></div>{#if turns.length}<button class="button" onclick={newConversation} disabled={busy}><Icon name="plus" size={16} />Nueva conversación</button>{/if}</div>
      {#if libraryError}<div class="library-alert" role="alert"><Icon name="alert" size={17} /><p>{libraryError}</p><button class="text-button" onclick={loadLibrary} disabled={libraryLoading}>Reintentar</button></div>{/if}

      <div class="chat-content">
        {#if !turns.length}
          <div class="welcome"><span class="welcome-symbol"><Icon name="sparkles" size={26} /></span><p class="eyebrow">Tu biblioteca tiene respuestas</p><h2>¿Por dónde empezamos?</h2><p>Encuentra noticias, conecta temas y comprueba<br class="desktop-break" /> de dónde sale cada respuesta.</p><div class="suggestion-grid">{#each suggestions as suggestion}<button class="suggestion-card" onclick={() => sendQuestion(suggestion.question)} disabled={busy}><span class="suggestion-icon"><Icon name={suggestion.icon} size={18} /></span><span><strong>{suggestion.title}</strong><small>{suggestion.description}</small></span><Icon name="arrow" size={15} /></button>{/each}</div><p class="welcome-note"><Icon name="shield" size={14} />Si el dato no consta en la colección, el asistente te lo indicará.</p></div>
        {:else}
          <div class="conversation-divider"><span>Esta conversación</span></div>
          {#each turns as turn (turn.id)}
            <article class="exchange" id={`turn-${turn.id}`} aria-label={`Consulta: ${turn.question}`}>
              <div class="user-message"><p>{turn.question}</p><span class="avatar user-avatar" aria-hidden="true">EH</span></div>
              <div class="assistant-message"><div class="assistant-heading"><span class="assistant-symbol"><Icon name="sparkles" size={15} /></span><strong>Asistente Dosier</strong><span class="message-time">{turn.time}</span></div>
                <div class="response-body" aria-busy={turn.pending}>
                  {#if turn.pending}<div class="thinking" role="status"><span class="thinking-dots"><i></i><i></i><i></i></span>Buscando información en los dosieres…</div><div class="answer-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
                  {:else if turn.error}<div class="answer-error" role="alert"><Icon name="alert" size={20} /><div><h2>No se ha podido obtener la respuesta.</h2><p>{turn.error}</p><button class="button" onclick={() => retry(turn)} disabled={busy}><Icon name="refresh" size={14} />Reintentar consulta</button></div></div>
                  {:else if turn.answer}
                    {#if turn.answer.estado === 'no_consta'}<div class="no-data-box"><p class="no-data-label"><Icon name="search" size={16} />Información no disponible en la biblioteca</p><h2>Ese dato no consta en los documentos.</h2><AnswerText text={turn.answer.respuesta} sources={turn.answer.fuentes} onopen={source => openSource(source, turn.id)} /></div>{:else}<AnswerText text={turn.answer.respuesta} sources={turn.answer.fuentes} onopen={source => openSource(source, turn.id)} />{/if}
                    {#if turn.answer.fuentes.length}<p class="sources-label"><Icon name="link" size={13} />{turn.answer.estado === 'no_consta' ? 'Registro del alcance documental' : turn.answer.fuentes.length === 1 ? 'Fuente que justifica la respuesta' : 'Fuentes que justifican la respuesta'}</p><div class="source-grid" class:single={turn.answer.fuentes.length === 1}>{#each turn.answer.fuentes as source, index (source.id)}<SourceCard {source} {index} onopen={source => openSource(source, turn.id)} />{/each}</div>{/if}
                    {#if turn.answer.estado === 'no_consta'}<p class="coverage-note"><Icon name="info" size={14} /><span>La ausencia del dato en esta biblioteca no significa que el dato no exista. Las fuentes de cobertura describen los límites de la colección.</span></p><button class="button small" onclick={() => navigate('documentos')}><Icon name="file" size={14} />Revisar la biblioteca</button>{/if}
                    <div class="answer-actions"><button class="text-button" onclick={() => copyText(turn.answer!.respuesta)}><Icon name="copy" size={14} />Copiar respuesta</button><span>{turn.answer.estado === 'no_consta' ? 'Sin evidencia suficiente para aportar una cifra' : 'Basado en la biblioteca de prensa'}</span></div>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        {/if}
      </div>

      <div class="composer-area">{#if turns.length}<div class="quick-suggestions">{#each suggestions.slice(0, 3) as suggestion}<button onclick={() => { draft = suggestion.question; void focusComposer() }} disabled={busy}>{suggestion.title}</button>{/each}</div>{/if}<form onsubmit={event => { event.preventDefault(); void sendQuestion(draft) }} aria-label="Enviar una pregunta"><label class="sr-only" for="question">Pregunta sobre los dosieres de prensa</label><div class="composer-box"><textarea bind:this={composer} bind:value={draft} id="question" rows="1" maxlength="2000" placeholder="Pregunta sobre los dosieres de prensa…" onkeydown={composerKey} oninput={resizeComposer} aria-describedby="composer-help"></textarea><button class="send-button" type="submit" disabled={busy || !draft.trim()} aria-label="Enviar pregunta"><Icon name="send" size={19} /></button></div><div class="composer-help" id="composer-help"><span><Icon name="shield" size={13} />Comprueba los datos en las fuentes de cada respuesta.</span><span>{draft.length > 1800 ? `${draft.length}/2000 caracteres` : 'Intro para enviar · Mayús + Intro para nueva línea'}</span></div></form></div>
    </section>

    <section class="page documents-page" hidden={page !== 'documentos'} aria-label="Documentos"><DocumentsPage baseline={library} onmetadata={updateMetadata} ondocument={openDocument} /><footer class="page-footer"><span>{library ? `${formatDate(library.fecha_desde)} – ${formatDate(library.fecha_hasta)}` : 'Biblioteca de prensa'}</span><span>{library?.datos_demostracion ? 'Colección de demostración' : 'Documentos disponibles'}</span></footer></section>

    <section class="page source-page" hidden={page !== 'fuente'} aria-label="Detalle de fuente">{#if selectedSource}<SourcePage source={selectedSource} document={sourceDocument} question={sourceQuestion} onback={returnFromSource} oncopy={copySource} onlibrary={() => navigate('documentos')} backLabel={sourceReturn === 'documentos' ? 'Volver a documentos' : 'Volver a la respuesta'} />{:else}<div class="page-heading"><div><p class="eyebrow">De la respuesta a la evidencia</p><h1>Comprueba la fuente.</h1><p class="heading-description">Cada respuesta conserva las referencias en las que se apoya.</p></div></div><div class="empty-state source-empty"><span class="empty-icon"><Icon name="link" size={28} /></span><h2>Selecciona una fuente de la conversación.</h2><p>Abre una tarjeta bajo una respuesta para ver el documento,<br class="desktop-break" /> la página y el fragmento utilizado.</p><button class="button primary" onclick={() => navigate('chat')}>Ir a la conversación<Icon name="arrow" size={15} /></button></div>{/if}</section>
  </main>
</div>

<dialog bind:this={documentDialog} onclose={() => selectedDocument = null} aria-labelledby="document-dialog-title" class="document-dialog">{#if selectedDocument}<div class="dialog-heading"><div><p class="eyebrow">Biblioteca de prensa</p><h2 id="document-dialog-title">{selectedDocument.nombre}</h2><p>{selectedDocument.id}{selectedDocument.simulado ? ' · Documento de demostración' : ''}</p></div><button class="icon-button" onclick={() => documentDialog?.close()} aria-label="Cerrar detalle del documento"><Icon name="close" /></button></div><div class="dialog-body"><dl class="document-facts"><div><dt>Fecha</dt><dd>{formatDate(selectedDocument.fecha, true)}</dd></div><div><dt>Tipo</dt><dd>{selectedDocument.tipo === 'dosier' ? 'Dosier de prensa' : 'Registro de análisis'}</dd></div>{#if selectedDocument.paginas}<div><dt>Páginas</dt><dd>{selectedDocument.paginas}</dd></div><div><dt>Recortes</dt><dd>{selectedDocument.recortes}</dd></div>{/if}</dl><div class="tags">{#each selectedDocument.temas as theme}<span>{theme}</span>{/each}</div><div class="dialog-divider"></div>{#if documentSources.length}<h3>Fragmentos citados en esta conversación</h3><div class="source-grid single">{#each documentSources as source (source.id)}<SourceCard {source} onopen={source => openSource(source, null, 'documentos')} />{/each}</div>{:else}<p class="document-context">Todavía no hay fragmentos citados de este documento en la conversación. Puedes consultar sus temas desde el chat.</p>{/if}{#if selectedDocument.simulado}<p class="document-demo-note"><Icon name="info" size={14} />Este documento forma parte del corpus ficticio de la demostración.</p>{/if}<button class="button primary" onclick={() => { documentDialog?.close(); navigate('chat'); void focusComposer() }}>Volver al chat<Icon name="arrow" size={15} /></button></div>{/if}</dialog>
<div class="toast" role="status" aria-live="polite" class:visible={!!notification}>{notification}</div>
