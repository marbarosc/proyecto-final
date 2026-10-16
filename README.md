# Dosier

Asistente para consultar dosieres de prensa de la Consejería de Economía y Hacienda de la Junta de Castilla y León. Responde con fuentes y fragmentos verificables, avisa cuando un dato no consta e incluye un buscador de documentos.

## Datos y tecnología

Los datos son ficticios y reproducibles, basados en `maquetas.html`: 7 dosieres simulados del 10 al 16 de octubre de 2026, 84 recortes, 78 noticias distintas y 2 registros. No se han extraído los PDF de prensa originales.

Servidor Python con FastAPI y RAG; interfaz Svelte con TypeScript y Vite. Generación: `gpt-6-luna`; embeddings: `text-embedding-3-small` (configurables en el entorno). El corpus y el índice se generan en `data/` y se reutilizan en los siguientes arranques. La clave permanece en el servidor; el navegador solo consulta `/api`.

## Cómo arrancar

Requisitos: Python 3.13, uv y Node.js con npm. Desde la raíz:

```powershell
uv sync
```

Crea un `.env` privado en la raíz con `OPENAI_API_KEY` y, si tu red lo necesita, `HTTPS_PROXY` y `NO_PROXY`. No subas ese archivo a Git. La primera ejecución necesita acceso al proveedor para crear los embeddings.

Arranca el servidor:

```powershell
uv run servidor.py
```

En otra terminal, instala y arranca la interfaz:

```powershell
cd web
npm.cmd ci
npm.cmd run dev
```

Abre http://127.0.0.1:5173. El servidor escucha en el puerto 8000 y Vite reenvía las peticiones `/api` a ese puerto.

## Cómo lo comprobé

- «¿En cuántas noticias se menciona a la Junta de Castilla y León?» → 32 noticias distintas; registro REG-001.
- «¿Existen noticias relacionadas con la automoción?» → 12 noticias distintas y 14 recortes, con sus fuentes.
- «¿Qué previsión hay sobre la economía regional, nacional e internacional?» → 2,1 %, 2,4 % y 2,9 % para 2026, respectivamente, con tres fuentes ficticias.
- «¿Cuál fue la tasa de paro en 1980?» → no consta, sin generar una cifra; registro de cobertura REG-002.

Las peticiones JSON están en `ejemplos/`. Las respuestas capturadas están en [capturas/comprobaciones.json](capturas/comprobaciones.json) y los fragmentos para contrastarlas en [capturas/fuentes-verificadas.html](capturas/fuentes-verificadas.html).

## Entregable

[Ver entregable.pdf](entregable.pdf) · 11 páginas A4, con cinco capturas completas, explicación del proyecto y comprobaciones. También está disponible [entregable.html](entregable.html); conserva la carpeta `capturas/` junto a él.

Para regenerarlo, con ambos servidores arrancados y Microsoft Edge instalado, ejecuta en `web/`:

```powershell
node capturas.mjs
```

Utiliza `playwright-core` y Edge instalado; no descarga navegadores. `node capturas.mjs --pdf` regenera solo el informe y el PDF a partir de las evidencias guardadas.
