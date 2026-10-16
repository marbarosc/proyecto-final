# Asistente de dosieres de prensa

Base de desarrollo para consultar dosieres de la Consejería de Economía y Hacienda de la Junta de Castilla y León.

## Estructura

- `src/proyecto_final/api.py`: servidor FastAPI y comprobación `/api/health`.
- `web/`: interfaz Svelte con TypeScript y Vite.
- `maquetas.html`: referencia visual independiente con datos ficticios.
- `dosieres/`: PDF locales; no se incorporan al repositorio.
- `.env`: configuración privada del servidor; no se incorpora al repositorio.
- `uv.lock` y `web/package-lock.json`: versiones de las dependencias.

## Requisitos

Python 3.13, uv y Node.js LTS con npm. Después de instalar Node.js en Windows, abre una nueva terminal para actualizar el `PATH`.

Las dependencias Python se gestionan exclusivamente con `uv`. Para reconstruir el entorno, ejecuta `uv sync` desde la raíz. Si la red requiere un proxy, configura `HTTPS_PROXY` en esa terminal antes de descargar dependencias.

Las dependencias de la interfaz se instalan con `npm ci` dentro de `web/`. El proxy de npm se ha configurado a partir de `HTTPS_PROXY` del `.env`; su valor no se incluye en el repositorio.

## Arranque en desarrollo

Abre dos terminales. En la primera, desde la raíz del proyecto:

```powershell
uv run uvicorn proyecto_final.api:app --reload --host 127.0.0.1 --port 8000
```

En la segunda:

```powershell
cd web
npm run dev
```

En PowerShell también puedes usar `npm.cmd` si la política de ejecución bloquea `npm.ps1`, sin cambiar esa política.

- Interfaz: http://127.0.0.1:5173
- API: http://127.0.0.1:8000/api/health
- Documentación de la API: http://127.0.0.1:8000/docs

La API carga el `.env` de la raíz con `python-dotenv`. La interfaz utiliza rutas relativas `/api`; el servidor de desarrollo de Vite las reenvía a `http://127.0.0.1:8000` conservando el prefijo `/api`. Esta regla es para desarrollo: un despliegue necesitará su propia configuración de encaminamiento.

También puedes iniciar el servidor, sin recarga automática, con `uv run proyecto-final`.

## Comprobaciones

Desde `web/`:

```powershell
npm run check
npm run build
```

Con los dos servidores arrancados, la petición a http://127.0.0.1:5173/api/health debe responder:

```json
{"status":"ok","service":"dosieres-api"}
```

## Alcance de esta preparación

La pantalla inicial verifica la conexión entre Svelte y FastAPI. La consulta de PDF, la base de datos y las llamadas a OpenAI se implementarán sobre esta estructura. Las comprobaciones de conexión no llaman a OpenAI ni envían dosieres a servicios externos.
