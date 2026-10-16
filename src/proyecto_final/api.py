"""API de consulta; las credenciales y el índice permanecen en el servidor."""

import asyncio
from contextlib import asynccontextmanager
from datetime import date
import logging
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from openai import OpenAIError

from .datos_demo import estadisticas, listar_documentos, normalizar
from .esquemas import ListadoDocumentos, Pregunta, Respuesta
from .rag import Configuracion, ErrorRAG, ServicioRAG

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOGGER = logging.getLogger(__name__)


def obtener_servicio(request: Request) -> ServicioRAG:
    return request.app.state.rag


def crear_app(servicio: ServicioRAG | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(aplicacion: FastAPI):
        propio = servicio is None
        if propio:
            load_dotenv(PROJECT_ROOT / ".env")
            configuracion = Configuracion.desde_entorno()
            aplicacion.state.rag = await asyncio.to_thread(ServicioRAG.preparar, PROJECT_ROOT / "data", configuracion)
        else:
            aplicacion.state.rag = servicio
        try:
            yield
        finally:
            if propio:
                aplicacion.state.rag.puerta.close()

    aplicacion = FastAPI(title="Dosier · API de prensa", description="RAG sobre el corpus ficticio de maquetas.html, con respuesta JSON y fuentes verificables.", version="0.2.0", lifespan=lifespan)

    @aplicacion.exception_handler(OpenAIError)
    async def error_proveedor(request: Request, error: OpenAIError):
        LOGGER.warning("Fallo del proveedor: %s", type(error).__name__)
        return JSONResponse(status_code=503, content={"detail": "El servicio de IA no está disponible. Revisa la configuración, el proxy y la disponibilidad del proveedor. No se ha sustituido el fallo por una respuesta inventada."})

    @aplicacion.exception_handler(ErrorRAG)
    async def error_respuesta(request: Request, error: ErrorRAG):
        LOGGER.warning("Respuesta o índice no válidos: %s", type(error).__name__)
        return JSONResponse(status_code=502, content={"detail": "No se ha podido obtener una respuesta con estructura y referencias válidas. Inténtalo de nuevo."})

    @aplicacion.get("/api/health", tags=["Sistema"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "dosieres-api"}

    @aplicacion.post("/api/preguntar", response_model=Respuesta, tags=["Conversación"])
    def preguntar(peticion: Pregunta, rag: ServicioRAG = Depends(obtener_servicio)) -> Respuesta:
        return rag.responder(peticion)

    @aplicacion.get("/api/documentos", response_model=ListadoDocumentos, tags=["Documentos"])
    def documentos(q: str = Query(default="", max_length=200), tema: str | None = None, tipo: Literal["dosier", "registro"] | None = None, fecha_desde: date | None = None, fecha_hasta: date | None = None, rag: ServicioRAG = Depends(obtener_servicio)) -> ListadoDocumentos:
        if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
            raise HTTPException(status_code=422, detail="fecha_desde debe ser anterior o igual a fecha_hasta")
        resultado = listar_documentos(rag.corpus)
        busqueda = normalizar(q.strip())
        resultado = [d for d in resultado if (not tipo or d["tipo"] == tipo) and (not tema or normalizar(tema) in {normalizar(t) for t in d["temas"]}) and (not fecha_desde or d["fecha"] >= fecha_desde) and (not fecha_hasta or d["fecha"] <= fecha_hasta) and (not busqueda or busqueda in normalizar(" ".join([d["id"], d["nombre"], *d["temas"]])))]
        fechas = [d.fecha for d in rag.corpus.documentos]
        return ListadoDocumentos(documentos=resultado, total_resultados=len(resultado), totales=estadisticas(rag.corpus), fecha_desde=min(fechas), fecha_hasta=max(fechas), datos_demostracion=rag.corpus.datos_demostracion)

    return aplicacion


app = crear_app()
