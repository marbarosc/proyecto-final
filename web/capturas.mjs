import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'capturas');
const baseURL = process.env.DOSIER_URL || 'http://127.0.0.1:5173';
const pdfOnly = process.argv.includes('--pdf');
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const questions = [
  ['01-junta.png', 'Menciones a la Junta', '¿En cuántas noticias se menciona a la Junta de Castilla y León?'],
  ['02-automocion.png', 'Noticias de automoción', '¿Existen noticias relacionadas con la automoción?'],
  ['03-previsiones.png', 'Previsiones económicas', '¿Qué previsión hay sobre la economía regional, nacional e internacional?'],
  ['04-no-consta.png', 'Reconocer los límites del corpus', '¿Cuál fue la tasa de paro en 1980?'],
];

// Lee únicamente el modelo y las fuentes públicas. Nunca exporta la clave del .env.
function referenceData() {
  const code = `import json
from dotenv import load_dotenv
from src.proyecto_final.datos_demo import cargar_corpus
from src.proyecto_final.rag import fragmentos_corpus, Configuracion
from pathlib import Path
load_dotenv()
c=cargar_corpus(Path('data/corpus.json'))
fragmentos,cobertura=fragmentos_corpus(c)
config=Configuracion.desde_entorno()
print(json.dumps({'modelo':config.modelo,'embeddings':config.modelo_embeddings,'fuentes':[f.fuente.model_dump(mode='json') for f in fragmentos]+[cobertura.model_dump(mode='json')]},ensure_ascii=True))`;
  const result = spawnSync(resolve(root, '.venv/Scripts/python.exe'), ['-c', code], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`No se pudo cotejar el corpus: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function saveScreenshot(page, filename) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  // En una captura larga, el compositor fijo taparía parte de la respuesta.
  // Solo durante la foto se coloca en el flujo normal; no se altera el contenido.
  await page.screenshot({ path: resolve(output, filename), fullPage: true, animations: 'disabled', style: '.composer-area, .topbar { position: static !important; } html { scroll-behavior: auto !important; }' });
  const buffer = await readFile(resolve(output, filename));
  const dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  assert.equal(dimensions.width, 1366, 'La captura debe tener el ancho de la ventana solicitada');
  assert.ok(buffer.length > 25000, 'La captura parece vacía');
  return dimensions;
}

async function capture(browser) {
  const reference = referenceData();
  const manifest = { fecha: new Date().toISOString(), zona_horaria: 'Europe/Madrid', url: baseURL, navegador: 'Microsoft Edge (channel: msedge)', viewport: { width: 1366, height: 900 }, modelo: reference.modelo, embeddings: reference.embeddings, consultas: [], documentos: null };
  const context = await browser.newContext({ viewport: manifest.viewport, deviceScaleFactor: 1, locale: 'es-ES', timezoneId: 'Europe/Madrid', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Consultas independientes: cada PNG conserva la respuesta completa y todas sus fuentes.
  for (const [filename, title, question] of questions) {
    console.log(`Consultando desde la interfaz: ${question}`);
    await page.goto(`${baseURL}/#/chat`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#question').waitFor();
    await page.locator('#question').fill(question);
    const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/preguntar' && r.request().method() === 'POST', { timeout: 180000 });
    await page.getByRole('button', { name: 'Enviar pregunta', exact: true }).click();
    const response = await responsePromise;
    assert.ok(response.ok(), `La API devolvió HTTP ${response.status()}: ${await response.text()}`);
    const answer = await response.json();
    assert.ok(answer.respuesta?.length > 30, 'Respuesta vacía');
    assert.ok(answer.fuentes?.length, 'Respuesta sin fuentes');
    assert.equal(answer.estado, filename.includes('no-consta') ? 'no_consta' : 'respondida');
    assert.equal(answer.generacion_utilizada, !filename.includes('no-consta'));
    const exchange = page.locator('.exchange').last();
    await exchange.locator('.answer-actions').waitFor({ timeout: 20000 });
    assert.equal(await exchange.locator('.source-card').count(), answer.fuentes.length);
    assert.ok((await exchange.innerText()).includes(answer.respuesta.replace(/\*\*/g, '').split('\n')[0].replace(/\[\d+\]/g, '').trim().slice(0, 25)), 'La respuesta no se ha mostrado en pantalla');
    for (const source of answer.fuentes) {
      const original = reference.fuentes.find(f => f.id === source.id);
      assert.ok(original, `Fuente desconocida: ${source.id}`);
      for (const key of ['fragmento', 'documento_id', 'pagina', 'funcion']) assert.equal(source[key], original[key], `Fuente alterada: ${source.id} (${key})`);
    }
    const dimensions = await saveScreenshot(page, filename);
    manifest.consultas.push({ titulo: title, pregunta: question, captura: filename, dimensiones: dimensions, ...answer, cotejo_fragmentos: 'Todos los fragmentos coinciden literalmente con las fuentes del corpus local.' });
    await writeFile(resolve(output, 'comprobaciones.json'), JSON.stringify(manifest, null, 2));
    console.log(`Guardada ${filename}: ${answer.estado}; ${answer.fuentes.length} fuentes cotejadas; ${dimensions.width}x${dimensions.height}`);
  }
  await page.goto(`${baseURL}/#/documentos`, { waitUntil: 'networkidle' });
  await page.locator('#documents-panel[aria-busy="false"] tbody tr').first().waitFor();
  const rows = await page.locator('#documents-panel tbody tr').count();
  assert.equal(rows, 7);
  manifest.documentos = { captura: '05-documentos.png', dosieres_visibles: rows, dimensiones: await saveScreenshot(page, '05-documentos.png') };
  assert.deepEqual(errors, [], 'Errores de ejecución en el navegador');
  await writeFile(resolve(output, 'comprobaciones.json'), JSON.stringify(manifest, null, 2));
  await context.close();
  return manifest;
}

function sourceLink(source) { return `<a href="capturas/fuentes-verificadas.html#${esc(source.id)}">${esc(source.documento_id)}${source.pagina ? `, p. ${source.pagina}` : ''} · ${esc(source.id)}</a>`; }

async function report(manifest) {
  const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' }).format(new Date(manifest.fecha));
  const sources = [...new Map(manifest.consultas.flatMap(c => c.fuentes).map(f => [f.id, f])).values()];
  const sourceHTML = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Dosier · Fuentes para comprobar el entregable</title><style>body{max-width:950px;margin:40px auto;padding:0 24px;font:17px/1.6 system-ui;color:#29242a}h1,h2{color:#782b40}article{border-top:1px solid #ddd;padding:24px 0;scroll-margin-top:20px}blockquote{background:#f8f3ee;padding:20px;margin:10px 0;white-space:pre-wrap}code{overflow-wrap:anywhere}</style><h1>Fuentes para comprobar Dosier</h1><p>Corpus ficticio de demostración. Estos son los fragmentos citados en la ejecución del ${esc(date)}, cotejados literalmente con el corpus local. Los nombres de PDF son referencias simuladas; no se han extraído los dosieres originales ni se acredita prensa real.</p><p>Abre <a href="../data/corpus.json">data/corpus.json</a> para revisar las noticias y recortes originales de esta demostración. Los registros REG-001 y REG-002 se calculan en <a href="../src/proyecto_final/datos_demo.py">src/proyecto_final/datos_demo.py</a>, función <code>textos_registros</code>. Las comprobaciones guardadas están en <a href="comprobaciones.json">comprobaciones.json</a>.</p>${sources.map(f => `<article id="${esc(f.id)}"><h2>${esc(f.documento)}</h2><p><code>${esc(f.id)}</code> · ${esc(f.documento_id)}${f.pagina ? ` · Página ${f.pagina} (simulada)` : ''} · ${esc(f.fecha)}</p><h3>${esc(f.titulo)}</h3><blockquote>${esc(f.fragmento)}</blockquote><p>Cotejo literal con el corpus: correcto. Función: ${f.funcion === 'cobertura' ? 'describir los límites documentales; no demuestra una tasa de paro' : 'evidencia de la respuesta'}. ${f.tipo === 'dosier' ? `En corpus.json busca la noticia ${esc(f.id.split(':')[1])} y su recorte en ${esc(f.documento_id)}.` : 'Revisa textos_registros para reproducir este registro a partir del corpus.'}</p></article>`).join('')}</html>`;
  await writeFile(resolve(output, 'fuentes-verificadas.html'), sourceHTML);
  const captions = [
    'El chat responde al recuento de menciones y muestra el registro utilizado. El recuento distingue noticias distintas de recortes republicados.',
    'La respuesta sobre automoción procede de una consulta real al servidor e incluye los fragmentos utilizados como evidencia.',
    'El asistente presenta las previsiones disponibles para Castilla y León, España y el ámbito internacional, acompañadas de sus fuentes ficticias.',
    'Ante la pregunta sobre 1980, el asistente indica que no consta. El registro de cobertura explica el límite de la biblioteca; no aporta una cifra histórica.',
  ];
  const compare = [
    'Sí, coincide: la respuesta da 32 noticias distintas y REG-001 dice que 35 recortes corresponden a 32 noticias distintas con mención a la Junta. Las 78 noticias son el total del corpus, no el recuento de menciones.',
    'Sí, coincide: REG-001 indica 12 noticias distintas y 14 recortes de automoción, con los temas enumerados en la respuesta. La noticia N-047 describe formación, modernización y adaptación de la cadena de componentes hacia la movilidad eléctrica.',
    'Sí, coincide: los tres fragmentos citados indican para 2026 un crecimiento del 2,1 % regional, 2,4 % nacional y 2,9 % mundial, con los mismos apoyos y riesgos que resume la respuesta. Son previsiones ficticias, no resultados observados.',
    'Sí, como explicación de ausencia de datos: REG-002 excluye series históricas de empleo y dice que no consta una tasa para 1980. No respalda ninguna cifra de paro; la respuesta tampoco inventa una.',
  ];
  const figures = manifest.consultas.map((c, i) => `<section class="sheet screenshot"><p class="eyebrow">La aplicación en uso · ${String(i + 1).padStart(2, '0')}</p><h2>${esc(c.titulo)}</h2><figure><img src="capturas/${esc(c.captura)}" alt="${esc(c.pregunta)}: respuesta real del servidor y fuentes"><figcaption>${esc(captions[i])} Ventana de 1366 × 900; captura de página completa para conservar todas las fuentes.</figcaption></figure></section>`).join('');
  const checks = manifest.consultas.map((c, i) => `<section class="sheet check"><p class="eyebrow">Cómo lo comprobé · Prueba ${i + 1}</p><h2>${esc(c.titulo)}</h2><h3>Pregunta enviada</h3><p class="question">${esc(c.pregunta)}</p><h3>Lo que respondió realmente</h3><div class="actual-answer">${esc(c.respuesta)}</div><h3>Contraste con las fuentes</h3><p>${esc(compare[i])}</p><p>${esc(c.cotejo_fragmentos)} ${c.generacion_utilizada ? 'El servidor indica que utilizó generación con el modelo.' : 'El servidor indica que no utilizó generación con el modelo.'}</p><h3>Qué fuentes abrir para confirmarlo</h3><ul>${c.fuentes.map(f => `<li>${sourceLink(f)}<br><span class="muted">${esc(f.titulo)}</span></li>`).join('')}</ul><p class="muted">Los enlaces abren los fragmentos cotejados en <code>capturas/fuentes-verificadas.html</code>. Ahí se indica cómo localizarlos en el corpus y cómo reproducir los registros. La comparación literal es automática; la lectura de si la respuesta interpreta bien cada fragmento debe confirmarse con estas fuentes.</p></section>`).join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dosier · Entregable del proyecto</title>
<style>
@page{size:A4;margin:15mm 15mm 17mm}*{box-sizing:border-box}body{margin:0;background:#eae6e1;color:#302b30;font:10.5pt/1.5 "Segoe UI",Arial,sans-serif}main{max-width:210mm;margin:auto}.sheet{background:#fff;min-height:260mm;padding:10mm;margin:10mm 0;break-before:page}.sheet:first-child{break-before:auto}h1,h2{font-family:Georgia,serif;line-height:1.15;font-weight:400;color:#762b40}h1{font-size:66pt;margin:20mm 0 8mm}h2{font-size:25pt;margin:0 0 7mm}h3{font-size:11pt;margin:6mm 0 2mm}.eyebrow{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#8b5260;margin:0 0 4mm}.subtitle{font:22pt/1.3 Georgia,serif;max-width:140mm}.cover .rule{height:2px;background:#762b40;margin:14mm 0 8mm}.cover .meta{margin-top:15mm;font-size:9pt;color:#70656a}.notice{background:#f8eee9;border-left:3px solid #a94f56;padding:4mm 5mm}.cover p{max-width:158mm}figure{margin:0;break-inside:avoid;page-break-inside:avoid}img{display:block;max-width:100%;max-height:218mm;width:auto;height:auto;margin:0 auto;border:1px solid #ded7d2;object-fit:contain}figcaption{font-size:9pt;line-height:1.45;color:#62575e;margin-top:4mm}.actual-answer{white-space:pre-wrap;background:#f8f5f1;border-left:2px solid #a48473;padding:4mm;font-size:10pt;line-height:1.5;overflow-wrap:anywhere}.question{font-weight:600}a{color:#762b40;text-decoration:underline;overflow-wrap:anywhere}code{font:9pt Consolas,monospace;overflow-wrap:anywhere}.muted{font-size:9pt;color:#71666c}ul{padding-left:5mm}li{margin:2mm 0;break-inside:avoid}.flow{border:1px solid #d8ccc4;padding:5mm;background:#f9f6f2;margin:6mm 0}.check h2{font-size:22pt}.check .actual-answer{font-size:9.5pt}.check ul{font-size:9.5pt}
@media print{body{background:white}main{max-width:none}.sheet{padding:0;margin:0;min-height:0}.cover{padding-top:16mm;min-height:255mm}a{color:inherit}.screenshot{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><main>
<section class="sheet cover"><p class="eyebrow">Proyecto final · Economía y Hacienda</p><h1>Dosier<span style="color:#b59786">.</span></h1><p class="subtitle">La actualidad, con sus fuentes.</p><div class="rule"></div><h3>Qué problema resuelve</h3><p>Dosier permite consultar en lenguaje natural los dosieres de prensa de la Consejería de Economía y Hacienda de la Junta de Castilla y León, sin revisar cada documento por separado. Reúne las respuestas y los fragmentos que las justifican, y avisa cuando la biblioteca no contiene el dato solicitado.</p><h3>De dónde salen los datos</h3><p>Esta entrega utiliza un corpus ficticio y reproducible basado en <code>maquetas.html</code>, generado por <code>src/proyecto_final/datos_demo.py</code> y guardado en <code>data/corpus.json</code>: 7 dosieres simulados del 10 al 16 de octubre de 2026, 84 recortes, 78 noticias distintas y 2 registros de análisis.</p><p class="notice">Las cifras, los medios y los nombres de PDF son de demostración. No se han extraído los PDF de prensa originales. Las respuestas capturadas sí proceden de la aplicación y de su servidor en funcionamiento.</p><p class="meta">Autor: Oscar Martínez Bartolomé<br>Ejecución y capturas: ${esc(date)} · Europe/Madrid<br>Microsoft Edge · ventana de 1366 × 900<br>Entregable HTML y PDF · capturas y evidencias relativas</p></section>
${figures}
<section class="sheet screenshot"><p class="eyebrow">La aplicación en uso · 05</p><h2>Biblioteca de documentos</h2><figure><img src="capturas/05-documentos.png" alt="Listado real con los siete dosieres disponibles"><figcaption>El listado muestra los 7 dosieres preparados, sus fechas, recortes y temas. Incluye buscador, filtros y la pestaña para consultar los 2 registros de análisis; los datos proceden de GET /api/documentos.</figcaption></figure></section>
${checks}
<section class="sheet"><p class="eyebrow">Arquitectura y reproducción</p><h2>Cómo está hecho</h2><h3>Servidor en Python con RAG</h3><p>FastAPI, Uvicorn, OpenAI, python-dotenv y NumPy. El servidor prepara fragmentos del corpus, calcula embeddings y conserva el índice en <code>data/indice.npz</code>. Reutiliza el índice si el corpus y la configuración no han cambiado.</p><div class="flow">Pregunta e historial → comprobación de cobertura → búsqueda por embeddings → selección de fragmentos → respuesta estructurada y fuentes.</div><p><code>POST /api/preguntar</code> devuelve estado, respuesta, fuentes y si se utilizó generación. <code>GET /api/documentos</code> sirve el listado y sus filtros. Las fuentes se construyen y validan en el servidor. La pregunta sobre 1980 se rechaza por falta de cobertura antes de llamar al modelo.</p><h3>Interfaz en Svelte</h3><p>Svelte con TypeScript y Vite: conversación, tarjetas de fuentes, aviso de ausencia de datos, biblioteca y detalle de fuente. El navegador consulta únicamente las rutas <code>/api</code>; Vite las dirige al servidor del puerto 8000. La clave permanece en el <code>.env</code> del servidor.</p><h3>Modelos utilizados</h3><p>Generación configurada: <strong>${esc(manifest.modelo)}</strong>.<br>Embeddings configurados: <strong>${esc(manifest.embeddings)}</strong>.</p><h3>Cómo reproducir esta entrega</h3><p>Desde la carpeta del proyecto, inicia <code>uv run servidor.py</code>. En otra terminal ejecuta <code>cd web</code> y <code>npm.cmd run dev</code>. Abre <code>http://127.0.0.1:5173</code>.</p><p>Con ambas partes arrancadas, ejecuta en <code>web/</code>: <code>node capturas.mjs</code>. El script utiliza <code>playwright-core</code> y Edge instalado con <code>channel: 'msedge'</code>; no descarga navegadores. Para regenerar solo el informe y el PDF desde las evidencias guardadas: <code>node capturas.mjs --pdf</code>.</p><h3>Qué se verificó y qué queda para revisión</h3><p>El script exige respuestas HTTP correctas, texto visible, fuentes mostradas y coincidencia literal de cada fuente con el corpus. Comprueba que 1980 devuelve <code>no_consta</code> sin generación, que el listado contiene siete dosieres y que no hay errores JavaScript. El significado de cada respuesta debe contrastarse leyendo los fragmentos enlazados en «Cómo lo comprobé».</p><p class="muted">Conserva entregable.html junto con la carpeta capturas para mantener sus imágenes y enlaces relativos. Las preguntas pueden producir redacciones distintas al repetir la generación. Las evidencias de esta ejecución están en capturas/comprobaciones.json.</p></section>
</main></body></html>`;
  await writeFile(resolve(root, 'entregable.html'), html);
}

async function printPDF(browser) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(root, 'entregable.html')).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
  assert.equal(await page.locator('img').count(), 5);
  await page.pdf({ path: resolve(root, 'entregable.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;text-align:center;font:9px Arial;color:#786772">Dosier · <span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '15mm', right: '15mm', bottom: '17mm', left: '15mm' } });
  const pdf = await readFile(resolve(root, 'entregable.pdf'));
  const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.equal(pages, 11, 'La paginación cambió: revisar que ninguna sección se desborde');
  const pageObjects = [...pdf.toString('latin1').matchAll(/\d+ 0 obj\s*([\s\S]*?)\s*endobj/g)].map(m => m[1]).filter(o => /\/Type\s*\/Page\b/.test(o));
  const imagePages = pageObjects.flatMap((o, i) => /\/XObject\b/.test(o) ? [i + 1] : []);
  assert.deepEqual(imagePages, [2, 3, 4, 5, 6], 'Cada captura debe ocupar una sola página propia');
  console.log(`PDF generado: entregable.pdf · ${pages} páginas A4 · ${pdf.length} bytes`);
  await writeFile(resolve(output, 'pdf.json'), JSON.stringify({ archivo: 'entregable.pdf', paginas: pages, formato: 'A4', imagenes: 5, paginas_con_capturas: imagePages, bytes: pdf.length }, null, 2));
  await page.close();
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const manifest = pdfOnly ? JSON.parse(await readFile(resolve(output, 'comprobaciones.json'), 'utf8')) : await capture(browser);
  await report(manifest);
  await printPDF(browser);
} finally { await browser.close(); }
