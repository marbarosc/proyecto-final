def main() -> None:
    """Arranca el servidor local mediante `uv run proyecto-final`."""
    import uvicorn

    uvicorn.run("proyecto_final.api:app", host="127.0.0.1", port=8000)
