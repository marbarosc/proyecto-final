"""Corpus reproducible de la maqueta. No extrae ni representa los PDF reales."""

from collections import Counter
from datetime import date
from pathlib import Path
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, model_validator


def normalizar(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if not unicodedata.combining(c))


class Documento(BaseModel):
    id: str
    nombre: str
    fecha: date
    paginas: int = Field(gt=0)
    temas: list[str]


class Noticia(BaseModel):
    id: str
    titulo: str
    texto: str = Field(min_length=1)
    medio: str
    temas: list[str]


class Recorte(BaseModel):
    documento_id: str
    noticia_id: str
    pagina: int = Field(gt=0)


class Corpus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    datos_demostracion: bool = True
    descripcion: str = "Recreación ficticia de maquetas.html; no es una extracción de los PDF locales."
    documentos: list[Documento] = Field(min_length=1)
    noticias: list[Noticia] = Field(min_length=1)
    recortes: list[Recorte] = Field(min_length=1)

    @model_validator(mode="after")
    def comprobar_referencias(self) -> "Corpus":
        docs = {d.id: d for d in self.documentos}
        noticias = {n.id for n in self.noticias}
        if len(docs) != len(self.documentos) or len(noticias) != len(self.noticias):
            raise ValueError("Identificadores duplicados en el corpus")
        referencias = set()
        for recorte in self.recortes:
            if recorte.documento_id not in docs or recorte.noticia_id not in noticias:
                raise ValueError("Un recorte referencia un documento o noticia inexistente")
            if recorte.pagina > docs[recorte.documento_id].paginas:
                raise ValueError("Página fuera del documento")
            clave = (recorte.documento_id, recorte.noticia_id, recorte.pagina)
            if clave in referencias:
                raise ValueError("Recorte duplicado en la misma localización")
            referencias.add(clave)
        if {r.noticia_id for r in self.recortes} != noticias:
            raise ValueError("Hay noticias sin un recorte asociado")
        return self


# Día, páginas y recortes: los mismos metadatos de maquetas.html.
DOSIERES = [
    (10, 28, 10, 4, 1, ["Economía regional", "Automoción", "Hacienda"]),
    (11, 24, 9, 3, 1, ["Automoción", "Empleo"]),
    (12, 32, 12, 5, 2, ["Economía regional", "Automoción"]),
    (13, 36, 13, 5, 2, ["Automoción", "Hacienda", "Empleo"]),
    (14, 41, 14, 6, 3, ["Automoción", "Economía regional", "Empleo"]),
    (15, 34, 12, 5, 2, ["Economía regional", "Automoción", "Hacienda"]),
    (16, 38, 14, 7, 3, ["Internacional", "Automoción", "Empleo"]),
]


def generar_corpus() -> Corpus:
    documentos = [Documento(id=f"D-202610{dia}", nombre=f"dossier {dia}-10-26.pdf", fecha=date(2026, 10, dia), paginas=paginas, temas=temas) for dia, paginas, _, _, _, temas in DOSIERES]
    # Cada pareja es una republicación del mismo artículo, no una noticia nueva.
    repetidos = {(11, 0): (10, 0), (13, 0): (12, 0), (15, 3): (14, 3), (12, 10): (10, 8), (14, 12): (11, 8), (16, 12): (13, 10)}
    especiales = {(14, 0): 47, (14, 4): 42, (15, 6): 56, (16, 8): 69}
    numeros = iter(n for n in range(1, 1000) if n not in especiales.values())
    noticias: list[Noticia] = []
    recortes: list[Recorte] = []
    originales: dict[tuple[int, int], str] = {}
    for dia, _, cantidad, menciones, automocion, temas in DOSIERES:
        for posicion in range(cantidad):
            pagina = 1 + posicion * 2
            if (dia, posicion) in repetidos:
                noticia_id = originales[repetidos[dia, posicion]]
            else:
                numero = especiales.get((dia, posicion))
                if numero is None:
                    numero = next(numeros)
                noticia_id = f"N-{numero:03}"
                menciona_junta = posicion < menciones
                es_auto = posicion < automocion
                if numero == 47:
                    titulo = "La automoción regional refuerza su apuesta por la formación y la modernización"
                    texto = "Las plantas de Valladolid y Palencia y sus proveedores concentran nuevas iniciativas de formación y modernización para avanzar hacia la movilidad eléctrica.\n\nLa noticia menciona a la Junta de Castilla y León en relación con la cualificación de las plantillas y la adaptación de la cadena de componentes."
                    pagina = 8
                elif numero == 42:
                    titulo = "Perspectivas de la economía de Castilla y León para 2026"
                    texto = "El análisis prevé un avance del PIB de Castilla y León del 2,1 % en 2026, apoyado en los servicios y la inversión industrial.\n\nEl escenario regional menciona a la Junta de Castilla y León y advierte de la dependencia de la demanda industrial. Es una previsión, no un resultado observado."
                    pagina = 3
                elif numero == 56:
                    titulo = "El consumo sostiene el escenario de crecimiento nacional"
                    texto = "La previsión para España sitúa el crecimiento de 2026 en el 2,4 %, con el consumo de los hogares como principal soporte.\n\nEl análisis nacional señala riesgos asociados al coste de la energía y la inversión. Es una previsión del PIB, no un dato observado."
                    pagina = 5
                elif numero == 69:
                    titulo = "La incertidumbre comercial condiciona las perspectivas internacionales"
                    texto = "El escenario central estima un crecimiento mundial del 2,9 % en 2026, condicionado por la energía y la incertidumbre comercial.\n\nLa previsión de la economía internacional está sujeta a riesgos en el comercio y la demanda. Se refiere al PIB mundial, no a resultados observados."
                    pagina = 9
                elif es_auto:
                    titulo = f"Automoción: proveedores y cualificación industrial · iniciativa {numero:03}"
                    texto = f"La iniciativa industrial {numero:03}, recogida en la prensa del {dia} de octubre de 2026, aborda la adaptación de proveedores de automoción en Castilla y León. Incluye formación de trabajadores, modernización productiva y componentes para vehículos eléctricos. La Junta de Castilla y León aparece mencionada en las actuaciones de apoyo al sector."
                elif menciona_junta:
                    titulo = f"La Junta de Castilla y León y el desarrollo económico · actuación {numero:03}"
                    texto = f"La información {numero:03}, del {dia} de octubre de 2026, menciona explícitamente a la Junta de Castilla y León. Describe actuaciones sobre inversión empresarial, servicios públicos y coordinación económica regional. No comunica una nueva previsión numérica de crecimiento."
                else:
                    titulo = f"Actividad empresarial y economía · información {numero:03}"
                    texto = f"La noticia económica {numero:03}, del {dia} de octubre de 2026, trata sobre actividad de pequeñas empresas, servicios, comercio y formación para el empleo. Describe iniciativas empresariales y su relación con la demanda local, sin cifras de desempleo ni pronósticos de crecimiento."
                temas_noticia = ["Automoción", "Empleo"] if es_auto else [t for t in temas if t != "Automoción"]
                if numero == 56:
                    temas_noticia = ["Economía nacional", "Previsiones"]
                elif numero == 69:
                    temas_noticia = ["Internacional", "Previsiones"]
                elif numero == 42:
                    temas_noticia = ["Economía regional", "Previsiones"]
                medio = "Panorama Económico" if numero == 56 else "Horizonte Global" if numero == 69 else "El Diario Castellano"
                noticias.append(Noticia(id=noticia_id, titulo=titulo, texto=texto, medio=medio, temas=temas_noticia))
                originales[(dia, posicion)] = noticia_id
            recortes.append(Recorte(documento_id=f"D-202610{dia}", noticia_id=noticia_id, pagina=pagina))
    return Corpus(documentos=documentos, noticias=noticias, recortes=recortes)


def cargar_corpus(ruta: Path) -> Corpus:
    """Solo genera la primera vez: una edición del JSON no se sobrescribe."""
    if ruta.exists():
        return Corpus.model_validate_json(ruta.read_text(encoding="utf-8"))
    corpus = generar_corpus()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(corpus.model_dump_json(indent=2), encoding="utf-8")
    return corpus


def estadisticas(corpus: Corpus) -> dict[str, int]:
    junta = {n.id for n in corpus.noticias if "junta de castilla y leon" in normalizar(n.texto)}
    auto = {n.id for n in corpus.noticias if "Automoción" in n.temas}
    return {"dosieres": len(corpus.documentos), "registros": 2, "recortes": len(corpus.recortes), "noticias_distintas": len(corpus.noticias), "menciones_junta": len(junta), "recortes_junta": sum(r.noticia_id in junta for r in corpus.recortes), "noticias_automocion": len(auto), "recortes_automocion": sum(r.noticia_id in auto for r in corpus.recortes)}


def textos_registros(corpus: Corpus) -> dict[str, str]:
    e = estadisticas(corpus)
    fechas = sorted(d.fecha for d in corpus.documentos)
    return {
        "REG-001": f"Registro de noticias y menciones. Cobertura: {fechas[0]} a {fechas[-1]}. {e['recortes']} recortes; {e['noticias_distintas']} noticias distintas, agrupando las republicaciones del mismo identificador. Mención explícita a la Junta de Castilla y León: {e['recortes_junta']} recortes correspondientes a {e['menciones_junta']} noticias distintas. Categoría automoción: {e['recortes_automocion']} recortes y {e['noticias_automocion']} noticias distintas. Subtemas: producción, proveedores, empleo y movilidad eléctrica. Las categorías pueden coincidir en una noticia.",
        "REG-002": f"Cobertura: dosieres del {fechas[0]} al {fechas[-1]}. Corpus ficticio generado para la demostración. No se incorporan series históricas de empleo. No consta una tasa de paro referida a 1980. Este registro documenta el alcance del corpus, no aporta una tasa de paro ni constituye evidencia de datos históricos.",
    }


def listar_documentos(corpus: Corpus) -> list[dict]:
    cantidades = Counter(r.documento_id for r in corpus.recortes)
    resultado = [{"id": d.id, "nombre": d.nombre, "tipo": "dosier", "fecha": d.fecha, "paginas": d.paginas, "recortes": cantidades[d.id], "temas": d.temas, "estado": "preparado", "simulado": corpus.datos_demostracion} for d in corpus.documentos]
    for identificador, nombre in [("REG-001", "Registro de noticias y menciones"), ("REG-002", "Cobertura y comprobación documental")]:
        resultado.append({"id": identificador, "nombre": nombre, "tipo": "registro", "fecha": max(d.fecha for d in corpus.documentos), "paginas": None, "recortes": 0, "temas": ["Recuentos"] if identificador == "REG-001" else ["Cobertura"], "estado": "preparado", "simulado": corpus.datos_demostracion})
    return resultado
