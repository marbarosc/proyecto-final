"""Contrato JSON de la API y de la salida estructurada del modelo."""

from datetime import date
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class Mensaje(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    rol: Literal["user", "assistant"] = Field(validation_alias=AliasChoices("rol", "role"))
    contenido: str = Field(min_length=1, max_length=6000, validation_alias=AliasChoices("contenido", "content"))


class Pregunta(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    pregunta: str = Field(min_length=1, max_length=2000)
    historial: list[Mensaje] = Field(default_factory=list, max_length=20)


class Fuente(BaseModel):
    id: str
    documento_id: str
    documento: str
    tipo: Literal["dosier", "registro"]
    titulo: str
    pagina: int | None
    fecha: date
    fragmento: str
    similitud: float | None
    funcion: Literal["evidencia", "cobertura"] = "evidencia"
    simulada: bool = True


class Respuesta(BaseModel):
    estado: Literal["respondida", "no_consta"]
    respuesta: str
    fuentes: list[Fuente]
    datos_demostracion: bool
    generacion_utilizada: bool


class SalidaModelo(BaseModel):
    """El modelo solo elige IDs; nunca construye documentos ni fragmentos."""
    hay_respuesta: bool
    respuesta: str
    fuentes_ids: list[str]


class DocumentoListado(BaseModel):
    id: str
    nombre: str
    tipo: Literal["dosier", "registro"]
    fecha: date
    paginas: int | None
    recortes: int
    temas: list[str]
    estado: Literal["preparado"]
    simulado: bool


class ListadoDocumentos(BaseModel):
    documentos: list[DocumentoListado]
    total_resultados: int
    totales: dict[str, int]
    fecha_desde: date
    fecha_hasta: date
    datos_demostracion: bool
