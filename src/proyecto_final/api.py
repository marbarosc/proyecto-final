"""Punto de entrada de la API de consulta de dosieres."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

app = FastAPI(
    title="Dosier · API de prensa",
    description="Estructura inicial del servidor de consulta de dosieres.",
    version="0.1.0",
)


@app.get("/api/health", tags=["Sistema"])
def health() -> dict[str, str]:
    """Comprueba la conexión sin consultar documentos ni servicios externos."""
    return {"status": "ok", "service": "dosieres-api"}
