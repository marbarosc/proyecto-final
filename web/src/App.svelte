<script lang="ts">
  import { onMount } from 'svelte'

  let connection = $state<'checking' | 'online' | 'offline'>('checking')

  async function checkConnection() {
    connection = 'checking'
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error('La API no está disponible')
      const data: unknown = await response.json()
      if (
        typeof data !== 'object' || data === null ||
        !('status' in data) || data.status !== 'ok' ||
        !('service' in data) || data.service !== 'dosieres-api'
      ) throw new Error('Respuesta de API inesperada')
      connection = 'online'
    } catch {
      connection = 'offline'
    }
  }

  onMount(() => { void checkConnection() })
</script>

<svelte:head>
  <title>Dosier · Asistente de prensa</title>
  <meta name="description" content="Entorno de desarrollo del asistente de consulta de dosieres de prensa de Economía y Hacienda." />
</svelte:head>

<main>
  <header><span class="brand-mark" aria-hidden="true">d.</span><strong>dosier</strong><span class="environment">Desarrollo local</span></header>
  <section aria-labelledby="welcome-title">
    <p class="eyebrow">Economía y Hacienda · Castilla y León</p>
    <h1 id="welcome-title">El punto de partida<br />para consultar tu prensa.</h1>
    <p class="intro">La estructura del proyecto está preparada. Esta pantalla comprueba la conexión entre la interfaz y el servidor.</p>

    <div class="connection-card" class:connected={connection === 'online'}>
      <div class="connection-heading">
        <h2>Conexión con el servidor</h2>
        <span class="status" role="status" aria-live="polite">
          <span class="dot" aria-hidden="true"></span>
          {connection === 'checking' ? 'Comprobando…' : connection === 'online' ? 'Conectado' : 'Sin conexión'}
        </span>
      </div>
      {#if connection === 'online'}
        <p>La interfaz recibe correctamente la respuesta de FastAPI a través de <code>/api/health</code>.</p>
      {:else if connection === 'offline'}
        <p>Comprueba que el servidor Python está iniciado en el puerto 8000 y vuelve a intentarlo.</p>
      {:else}
        <p>Comprobando la conexión local con la API de dosieres…</p>
      {/if}
      <button onclick={checkConnection} disabled={connection === 'checking'}>Comprobar conexión <span aria-hidden="true">↗</span></button>
    </div>

    <div class="project-notes"><p><strong>Siguiente fase</strong><br />Incorporar los dosieres, la búsqueda y las respuestas con fuentes.</p><p><strong>Base instalada</strong><br />FastAPI · Svelte · TypeScript · Vite</p></div>
  </section>
  <footer>Asistente de prensa · Entorno de desarrollo</footer>
</main>
