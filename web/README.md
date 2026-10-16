# Dosier · Interfaz Svelte

Aplicación en Svelte 5 y TypeScript que sigue `../maquetas.html`. No requiere librerías adicionales a las de la plantilla Vite.

## Arranque

Desde la raíz del proyecto, en una terminal:

```powershell
uv run servidor.py
```

En otra terminal, también desde la raíz:

```powershell
cd web
npm run dev
```

Abre http://127.0.0.1:5173. En PowerShell puedes usar `npm.cmd` si la política de ejecución bloquea `npm.ps1`.

## Pantallas

- `#/chat`: conversación con historial, sugerencias, estados de espera y error, fuentes y aviso de «no consta».
- `#/documentos`: listado, búsqueda, filtros por tema y fecha, pestañas de dosieres y registros, metadatos y fragmentos ya citados en la conversación.
- `#/fuente`: detalle del fragmento seleccionado, referencia de origen y regreso a la respuesta.

La navegación conserva el estado durante la sesión. Una recarga inicia una sesión nueva; no se guarda la conversación en el almacenamiento del navegador.

## Conexión con el servidor

`src/lib/api.ts` valida las respuestas y usa exclusivamente rutas relativas `/api/documentos` y `/api/preguntar`. `vite.config.ts` las reenvía al servidor Python en `127.0.0.1:8000` conservando `/api`. Los campos del historial son `rol` y `contenido`.

La clave de OpenAI solo se carga en Python. No se necesita ningún `.env` en `web/` ni se lee el `.env` de la raíz desde Vite. La interfaz utiliza las fuentes que devuelve la API, sin generar respuestas de ejemplo por su cuenta.

La vista de fuente muestra el fragmento devuelto por el servidor. El detalle de un documento lista sus metadatos y los fragmentos ya citados en la sesión; no simula la lectura de un PDF completo.

## Comprobaciones

```powershell
npm run check
npm run build
```

`npm run build` genera `dist/`. El proxy configurado es de desarrollo: un alojamiento de producción deberá dirigir `/api` al servidor Python.
