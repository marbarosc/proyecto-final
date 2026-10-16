"""Arranque: uv run servidor.py. Documentación: http://127.0.0.1:8000/docs."""

import logging

import uvicorn

from proyecto_final.api import app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run(app, host="127.0.0.1", port=8000)
