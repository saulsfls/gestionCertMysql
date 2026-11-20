// ============================================================
// Rutas del catálogo de títulos y unidades
// ============================================================
const express = require('express');
const router = express.Router();


// ── Controladores del catálogo ──
const {
  // Lectura
  obtenerCatalogo,
  obtenerTitulos,
  obtenerUnidades,
  // Creación
  crearTitulo,
  crearSubparametro,
  crearUnidad,
  crearMagnitud,
  // Actualización
  actualizarTitulo,
  actualizarSubparametro,
  actualizarMagnitud,
  actualizarUnidad,
  // Eliminación
  eliminarTitulo,
  eliminarSubparametro,
  eliminarMagnitud,
  eliminarUnidad,
} = require('../controllers/titulos-unidades');


// ============================================================
// HELPERS LOCALES
// ============================================================

// Extrae el actor del body (por si luego se quiere auditar)
function getActorFromBody(body) {
  if (!body) return 'system';
  return (
    body.actor_id ||
    body.updated_by ||
    body.username ||
    body.user ||
    'system'
  );
}

// Mapea errores del controlador a respuestas HTTP amigables
function responderError(res, error, contexto) {
  console.error(`Error en catálogo (${contexto}):`, error);

  const code     = error.code     ?? null;
  const errno    = error.errno    ?? null;
  const sqlState = error.sqlState ?? null;
  const message  = error.message  ?? '';
  const detail   = error.sqlMessage ?? error.detail ?? '';
  const column   = error.column   ?? null;
  const status   = error.status   ?? null;

  // Errores de negocio lanzados por el controlador (status + code ya definidos)
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({
      ok: false,
      code,
      errno,
      sqlState,
      column,
      message,
      detail: process.env.NODE_ENV === 'development' ? detail : undefined
    });
  }

  // Duplicados (PK de la tabla o validaciones del controlador)
  if (code === 'ER_DUP_ENTRY' || errno === 1062) {
    return res.status(409).json({
      ok: false, code, errno, sqlState, column,
      message: 'El registro ya existe en el catálogo.',
      detail
    });
  }

  // Fila inexistente (catálogo no seedeado)
  if (code === 'CATALOGO_NO_EXISTE') {
    return res.status(500).json({
      ok: false, code, errno, sqlState, column,
      message: 'El catálogo no está inicializado. Ejecuta el seed antes de usar este endpoint.',
      detail
    });
  }

  // FK
  if (errno === 1452 || errno === 1216 || errno === 1217) {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'La referencia indicada no existe en el catálogo.',
      detail
    });
  }

  // NOT NULL
  if (errno === 1048) {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'Falta un campo obligatorio para completar la operación.',
      detail
    });
  }

  // CHECK / restricciones
  if (errno === 3819) {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'Un valor no cumple con las restricciones definidas en la base de datos.',
      detail
    });
  }

  // Formato de fecha / número
  if (errno === 1366 || errno === 1292) {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'Revisa el formato de los valores antes de guardar.',
      detail
    });
  }

  // Tamaño excedido
  if (errno === 1264 || errno === 1406) {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'Alguno de los valores excede el tamaño permitido.',
      detail
    });
  }

  // JSON inválido
  if (code === 'ER_INVALID_JSON_TEXT' || sqlState === '22032') {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'El JSON del catálogo quedó inválido tras la operación. No se guardó nada.',
      detail
    });
  }

  if (sqlState === '23000') {
    return res.status(400).json({
      ok: false, code, errno, sqlState, column,
      message: 'Alguno de los datos no cumple con las restricciones de la base de datos.',
      detail
    });
  }

  // Fallback
  return res.status(500).json({
    ok: false, code, errno, sqlState,
    message: 'Error en el servidor al procesar el catálogo.',
    detail: process.env.NODE_ENV === 'development' ? (detail || message) : undefined
  });
}


// ============================================================
// LECTURA
// ============================================================

// GET: catálogo completo { titulos, unidades }
router.get('/', async (req, res) => {
  try {
    const data = await obtenerCatalogo();
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(res, error, 'GET /');
  }
});

// GET: solo títulos
router.get('/titulos', async (req, res) => {
  try {
    const data = await obtenerTitulos();
    return res.status(200).json({
      ok: true,
      total: Object.keys(data || {}).length,
      data
    });
  } catch (error) {
    return responderError(res, error, 'GET /titulos');
  }
});

// GET: solo unidades
router.get('/unidades', async (req, res) => {
  try {
    const data = await obtenerUnidades();
    return res.status(200).json({
      ok: true,
      total: Object.keys(data || {}).length,
      data
    });
  } catch (error) {
    return responderError(res, error, 'GET /unidades');
  }
});


// ============================================================
// CREACIÓN
// ============================================================

// POST: crear título nuevo
router.post('/titulos', async (req, res) => {
  try {
    // const actor = getActorFromBody(req.body); // disponible para auditar
    const titulo = await crearTitulo(req.body);
    return res.status(201).json({ ok: true, data: titulo });
  } catch (error) {
    return responderError(res, error, 'POST /titulos');
  }
});

// POST: crear subparámetro dentro de un título
router.post('/subparametros', async (req, res) => {
  try {
    const subparametro = await crearSubparametro(req.body);
    return res.status(201).json({ ok: true, data: subparametro });
  } catch (error) {
    return responderError(res, error, 'POST /subparametros');
  }
});

// POST: crear unidad dentro de una magnitud existente
router.post('/unidades', async (req, res) => {
  try {
    const unidad = await crearUnidad(req.body);
    return res.status(201).json({ ok: true, data: unidad });
  } catch (error) {
    return responderError(res, error, 'POST /unidades');
  }
});

// POST: crear magnitud nueva (opcional)
router.post('/magnitudes', async (req, res) => {
  try {
    const magnitud = await crearMagnitud(req.body);
    return res.status(201).json({ ok: true, data: magnitud });
  } catch (error) {
    return responderError(res, error, 'POST /magnitudes');
  }
});


// ============================================================
// ACTUALIZACIÓN (PUT)
// ============================================================

// PUT: actualizar título (label / magnitud)
router.put('/titulos/:id', async (req, res) => {
  try {
    const data = await actualizarTitulo(req.params.id, req.body);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(res, error, `PUT /titulos/${req.params.id}`);
  }
});

// PUT: actualizar subparámetro (label / unidadesOverride)
router.put('/titulos/:tituloId/subparametros/:subId', async (req, res) => {
  try {
    const data = await actualizarSubparametro(
      req.params.tituloId,
      req.params.subId,
      req.body
    );
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(
      res,
      error,
      `PUT /titulos/${req.params.tituloId}/subparametros/${req.params.subId}`
    );
  }
});

// PUT: actualizar magnitud (nombre)
router.put('/magnitudes/:id', async (req, res) => {
  try {
    const data = await actualizarMagnitud(req.params.id, req.body);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(res, error, `PUT /magnitudes/${req.params.id}`);
  }
});

// PUT: actualizar unidad (nombre / factor / prefijo)
router.put('/magnitudes/:magnitudId/unidades/:simbolo', async (req, res) => {
  try {
    const data = await actualizarUnidad(
      req.params.magnitudId,
      decodeURIComponent(req.params.simbolo),
      req.body
    );
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(
      res,
      error,
      `PUT /magnitudes/${req.params.magnitudId}/unidades/${req.params.simbolo}`
    );
  }
});


// ============================================================
// ELIMINACIÓN (DELETE)
// ============================================================

// DELETE: eliminar título
router.delete('/titulos/:id', async (req, res) => {
  try {
    const data = await eliminarTitulo(req.params.id);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(res, error, `DELETE /titulos/${req.params.id}`);
  }
});

// DELETE: eliminar subparámetro de un título
router.delete('/titulos/:tituloId/subparametros/:subId', async (req, res) => {
  try {
    const data = await eliminarSubparametro(
      req.params.tituloId,
      req.params.subId
    );
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(
      res,
      error,
      `DELETE /titulos/${req.params.tituloId}/subparametros/${req.params.subId}`
    );
  }
});

// DELETE: eliminar magnitud (bloqueado si está en uso)
router.delete('/magnitudes/:id', async (req, res) => {
  try {
    const data = await eliminarMagnitud(req.params.id);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(res, error, `DELETE /magnitudes/${req.params.id}`);
  }
});

// DELETE: eliminar unidad de una magnitud
router.delete('/magnitudes/:magnitudId/unidades/:simbolo', async (req, res) => {
  try {
    const data = await eliminarUnidad(
      req.params.magnitudId,
      decodeURIComponent(req.params.simbolo)
    );
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return responderError(
      res,
      error,
      `DELETE /magnitudes/${req.params.magnitudId}/unidades/${req.params.simbolo}`
    );
  }
});


module.exports = router;