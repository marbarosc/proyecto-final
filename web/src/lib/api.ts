// Todo el tráfico de datos pasa por el proxy /api de Vite.
export interface Source {
  id: string
  documento_id: string
  documento: string
  tipo: 'dosier' | 'registro'
  titulo: string
  pagina: number | null
  fecha: string
  fragmento: string
  similitud: number | null
  funcion: 'evidencia' | 'cobertura'
  simulada: boolean
}

export interface Answer {
  estado: 'respondida' | 'no_consta'
  respuesta: string
  fuentes: Source[]
  datos_demostracion: boolean
  generacion_utilizada: boolean
}

export interface DocumentItem {
  id: string
  nombre: string
  tipo: 'dosier' | 'registro'
  fecha: string
  paginas: number | null
  recortes: number
  temas: string[]
  estado: 'preparado'
  simulado: boolean
}

export interface Library {
  documentos: DocumentItem[]
  total_resultados: number
  totales: Record<string, number>
  fecha_desde: string
  fecha_hasta: string
  datos_demostracion: boolean
}

export interface Message { rol: 'user' | 'assistant'; contenido: string }
export interface DocumentFilters { q?: string; tema?: string; tipo?: 'dosier' | 'registro'; fecha?: string }

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const nullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))

function isSource(value: unknown): value is Source {
  return object(value) && ['id', 'documento_id', 'documento', 'titulo', 'fecha', 'fragmento'].every(key => typeof value[key] === 'string') &&
    (value.tipo === 'dosier' || value.tipo === 'registro') && nullableNumber(value.pagina) && nullableNumber(value.similitud) &&
    (value.funcion === 'evidencia' || value.funcion === 'cobertura') && typeof value.simulada === 'boolean'
}

function isAnswer(value: unknown): value is Answer {
  return object(value) && (value.estado === 'respondida' || value.estado === 'no_consta') && typeof value.respuesta === 'string' &&
    Array.isArray(value.fuentes) && value.fuentes.every(isSource) && typeof value.datos_demostracion === 'boolean' && typeof value.generacion_utilizada === 'boolean'
}

function isDocument(value: unknown): value is DocumentItem {
  return object(value) && ['id', 'nombre', 'fecha'].every(key => typeof value[key] === 'string') &&
    (value.tipo === 'dosier' || value.tipo === 'registro') && nullableNumber(value.paginas) && typeof value.recortes === 'number' &&
    Array.isArray(value.temas) && value.temas.every(t => typeof t === 'string') && value.estado === 'preparado' && typeof value.simulado === 'boolean'
}

function isLibrary(value: unknown): value is Library {
  return object(value) && Array.isArray(value.documentos) && value.documentos.every(isDocument) && typeof value.total_resultados === 'number' &&
    object(value.totales) && Object.values(value.totales).every(n => typeof n === 'number' && Number.isFinite(n)) &&
    typeof value.fecha_desde === 'string' && typeof value.fecha_hasta === 'string' && typeof value.datos_demostracion === 'boolean'
}

async function request(path: string, init: RequestInit = {}, timeout = 15000): Promise<unknown> {
  try {
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    const response = await fetch(path, { ...init, signal })
    if (!response.ok) {
      if (response.status === 503) throw new Error('El servicio de respuestas no está disponible. Inténtalo de nuevo en unos momentos.')
      if (response.status === 502) throw new Error('No se ha podido obtener una respuesta con fuentes válidas. Inténtalo de nuevo.')
      if (response.status === 422) throw new Error('Revisa la pregunta o los filtros y vuelve a intentarlo.')
      throw new Error('No se ha podido completar la consulta. Inténtalo de nuevo.')
    }
    return await response.json()
  } catch (error) {
    if (init.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('La consulta está tardando demasiado. Vuelve a intentarlo.')
    if (error instanceof TypeError) throw new Error('No se puede conectar con el servidor. Comprueba que está iniciado y vuelve a intentarlo.')
    throw error
  }
}

export async function getDocuments(filters: DocumentFilters = {}, signal?: AbortSignal): Promise<Library> {
  const query = new URLSearchParams()
  if (filters.q?.trim()) query.set('q', filters.q.trim())
  if (filters.tema) query.set('tema', filters.tema)
  if (filters.tipo) query.set('tipo', filters.tipo)
  if (filters.fecha) { query.set('fecha_desde', filters.fecha); query.set('fecha_hasta', filters.fecha) }
  const data = await request('/api/documentos' + (query.size ? '?' + query.toString() : ''), { signal })
  if (!isLibrary(data)) throw new Error('El servidor ha devuelto un listado de documentos inesperado.')
  return data
}

export async function ask(question: string, history: Message[], signal?: AbortSignal): Promise<Answer> {
  const data = await request('/api/preguntar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: question, historial: history.slice(-20).map(m => ({ rol: m.rol, contenido: m.contenido.slice(0, 6000) })) }), signal,
  }, 120000)
  if (!isAnswer(data)) throw new Error('El servidor ha devuelto una respuesta inesperada. Vuelve a intentarlo.')
  return data
}

export function formatDate(value: string, long = false): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' }).format(new Date(value + 'T12:00:00'))
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido completar la consulta. Inténtalo de nuevo.'
}
