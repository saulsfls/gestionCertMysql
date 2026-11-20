const express = require('express');
const router = express.Router();

// Los nombres de funciones NO cambian (el controlador los exporta en español)
const {
  crearIncertidumbre,
  obtenerIncertidumbres,
  obtenerIncertidumbreId,
  obtenerIncertidumbrePorClave,
  obtenerIncertidumbresPorTipo,
  obtenerIncertidumbresPorDistribucion,
  actualizarIncertidumbre,
  desactivarIncertidumbre,
  activarIncertidumbre,
  eliminarIncertidumbre
} = require('../controllers/incertidumbres'); // Ajusta la ruta a tu controlador


// Constantes de validación (valores de enum sin cambios)

const TIPOS_VALIDOS = ['TIPO A', 'TIPO B'];
const DISTRIBUCIONES_VALIDAS = ['NORMAL', 'RECTANGULAR', 'TRIANGULAR', 'U', 'OTRA'];
const CAMPOS_ACTUALIZABLES = ['clave', 'name', 'description', 'type', 'distribution', 'obsolete'];


// Helpers

function validarEnums({ type, distribution }) {
  if (type !== undefined && !TIPOS_VALIDOS.includes(type)) {
    return `El campo 'type' debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`;
  }
  if (distribution !== undefined && !DISTRIBUCIONES_VALIDAS.includes(distribution)) {
    return `El campo 'distribution' debe ser uno de: ${DISTRIBUCIONES_VALIDAS.join(', ')}`;
  }
  return null;
}

function validarObsoleto(obsolete) {
  if (obsolete === undefined) return null;
  if (obsolete !== 0 && obsolete !== 1 && obsolete !== '0' && obsolete !== '1') {
    return "El campo 'obsolete' debe ser 0 o 1.";
  }
  return null;
}

// Traduce errores MariaDB a respuestas HTTP coherentes
function responderError(res, error, contexto = 'la incertidumbre') {
  console.error(`Error al procesar ${contexto}:`, error);

  const code     = error.code     ?? null;
  const errno    = error.errno    ?? null;
  const sqlState = error.sqlState ?? null;
  const message  = error.message  ?? '';
  const detail   = error.sqlMessage ?? error.detail ?? '';

  if (errno === 1048) {
    return res.status(400).json({
      ok: false, code, errno, sqlState,
      message: `Falta un campo obligatorio para ${contexto}.`, detail
    });
  }

  if (errno === 1062) {
    return res.status(409).json({
      ok: false, code, errno, sqlState,
      message: 'Ya existe un registro con esa clave.', detail
    });
  }

  if (errno === 1366 || errno === 1292) {
    return res.status(400).json({
      ok: false, code, errno, sqlState,
      message: 'Revisa el formato de los valores (enum o numérico inválido).', detail
    });
  }

  if (errno === 1264 || errno === 1406) {
    return res.status(400).json({
      ok: false, code, errno, sqlState,
      message: 'Alguno de los valores excede el tamaño permitido.', detail
    });
  }

  if (errno === 1451) {
    return res.status(409).json({
      ok: false, code, errno, sqlState,
      message: 'No se puede eliminar: el registro está referenciado por otros.',
      detail
    });
  }

  if (sqlState === '23000') {
    return res.status(400).json({
      ok: false, code, errno, sqlState,
      message: 'Alguno de los datos no cumple con las restricciones de la base de datos.', detail
    });
  }

  return res.status(500).json({
    ok: false, code, errno, sqlState,
    message: `Error en el servidor al procesar ${contexto}.`,
    detail: process.env.NODE_ENV === 'development' ? (detail || message) : undefined
  });
}


// POST: Crear una nueva incertidumbre
// Body esperado: { clave, name, description, type, distribution, obsolete? }

router.post('/nuevo', async (req, res) => {
  try {
    const errorEnum = validarEnums(req.body);
    if (errorEnum) return res.status(400).json({ ok: false, message: errorEnum });

    const errorObsoleto = validarObsoleto(req.body.obsolete);
    if (errorObsoleto) return res.status(400).json({ ok: false, message: errorObsoleto });

    const nueva = await crearIncertidumbre(req.body);
    return res.status(201).json({ ok: true, data: nueva });
  } catch (error) {
    return responderError(res, error, 'guardar la incertidumbre');
  }
});


// GET: Listar incertidumbres
// Query opcional: ?incluirObsoletos=true

router.get('/', async (req, res) => {
  try {
    const incluirObsoletos = req.query.incluirObsoletos === 'true';
    const lista = await obtenerIncertidumbres(incluirObsoletos);
    res.status(200).json({ ok: true, total: lista.length, data: lista });
  } catch (error) {
    console.error('Error al consultar incertidumbres:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener la lista de incertidumbres' });
  }
});


// GET: Listar solo obsoletos (auditoría)

router.get('/obsoletos', async (req, res) => {
  try {
    const lista = await obtenerIncertidumbres(true);
    const soloObsoletos = lista.filter((i) => Number(i.obsolete) === 1);
    res.status(200).json({ ok: true, total: soloObsoletos.length, data: soloObsoletos });
  } catch (error) {
    console.error('Error al consultar incertidumbres obsoletas:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener las incertidumbres obsoletas' });
  }
});


// GET: Filtrar por tipo

router.get('/tipo/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({
        ok: false,
        message: `El tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}`
      });
    }

    const incluirObsoletos = req.query.incluirObsoletos === 'true';
    const lista = await obtenerIncertidumbresPorTipo(tipo, incluirObsoletos);
    res.status(200).json({ ok: true, total: lista.length, data: lista });
  } catch (error) {
    console.error('Error al consultar incertidumbres por tipo:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener incertidumbres por tipo' });
  }
});


// GET: Filtrar por distribución

router.get('/distribucion/:distribucion', async (req, res) => {
  try {
    const { distribucion } = req.params;
    if (!DISTRIBUCIONES_VALIDAS.includes(distribucion)) {
      return res.status(400).json({
        ok: false,
        message: `La distribución debe ser una de: ${DISTRIBUCIONES_VALIDAS.join(', ')}`
      });
    }

    const incluirObsoletos = req.query.incluirObsoletos === 'true';
    const lista = await obtenerIncertidumbresPorDistribucion(distribucion, incluirObsoletos);
    res.status(200).json({ ok: true, total: lista.length, data: lista });
  } catch (error) {
    console.error('Error al consultar incertidumbres por distribución:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener incertidumbres por distribución' });
  }
});


// GET: Buscar por clave (UNIQUE)

router.get('/clave/:clave', async (req, res) => {
  try {
    const { clave } = req.params;
    const incertidumbre = await obtenerIncertidumbrePorClave(clave);

    if (!incertidumbre) {
      return res.status(404).json({
        ok: false,
        message: `Incertidumbre con clave '${clave}' no encontrada`
      });
    }

    res.status(200).json({ ok: true, data: incertidumbre });
  } catch (error) {
    console.error('Error al consultar incertidumbre por clave:', error);
    res.status(500).json({ ok: false, message: 'Error al consultar la incertidumbre por clave' });
  }
});


// GET: Buscar por ID (incluye obsoletos)

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const incertidumbre = await obtenerIncertidumbreId(id);

    if (!incertidumbre) {
      return res.status(404).json({ ok: false, message: 'Incertidumbre no encontrada' });
    }

    res.status(200).json({ ok: true, data: incertidumbre });
  } catch (error) {
    console.error('Error al consultar la incertidumbre:', error);
    res.status(500).json({ ok: false, message: 'Error al consultar la incertidumbre' });
  }
});


// PATCH: Actualización parcial
// Body esperado: subconjunto de { clave, name, description, type, distribution, obsolete }

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Filtrar solo campos permitidos
    const cambios = {};
    for (const campo of CAMPOS_ACTUALIZABLES) {
      if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({
        ok: false,
        message: `Debes enviar al menos un campo actualizable: ${CAMPOS_ACTUALIZABLES.join(', ')}`
      });
    }

    const errorEnum = validarEnums(cambios);
    if (errorEnum) return res.status(400).json({ ok: false, message: errorEnum });

    const errorObsoleto = validarObsoleto(cambios.obsolete);
    if (errorObsoleto) return res.status(400).json({ ok: false, message: errorObsoleto });

    // Normalizar obsolete a número
    if (cambios.obsolete !== undefined) {
      cambios.obsolete = Number(cambios.obsolete);
    }

    const actualizada = await actualizarIncertidumbre(id, cambios);

    if (!actualizada) {
      return res.status(404).json({
        ok: false,
        message: 'Incertidumbre no encontrada para actualizar'
      });
    }

    res.status(200).json({ ok: true, data: actualizada });
  } catch (error) {
    return responderError(res, error, 'actualizar la incertidumbre');
  }
});


// PUT: Desactivar (baja lógica → obsolete = 1)

router.put('/:id/desactivar', async (req, res) => {
  try {
    const { id } = req.params;
    const incertidumbre = await desactivarIncertidumbre(id);

    if (!incertidumbre) {
      return res.status(404).json({
        ok: false,
        message: 'Incertidumbre no encontrada para desactivar'
      });
    }

    res.status(200).json({ ok: true, data: incertidumbre });
  } catch (error) {
    console.error('Error al desactivar la incertidumbre:', error);
    res.status(500).json({ ok: false, message: 'Error al desactivar la incertidumbre' });
  }
});


// PUT: Activar (obsolete = 0)

router.put('/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const incertidumbre = await activarIncertidumbre(id);

    if (!incertidumbre) {
      return res.status(404).json({
        ok: false,
        message: 'Incertidumbre no encontrada para activar'
      });
    }

    res.status(200).json({ ok: true, data: incertidumbre });
  } catch (error) {
    console.error('Error al activar la incertidumbre:', error);
    res.status(500).json({ ok: false, message: 'Error al activar la incertidumbre' });
  }
});


// DELETE: Eliminar permanentemente

router.delete('/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;
    const eliminada = await eliminarIncertidumbre(id);

    if (!eliminada) {
      return res.status(404).json({
        ok: false,
        message: 'Incertidumbre no encontrada para eliminar'
      });
    }

    res.status(200).json({ ok: true, data: eliminada });
  } catch (error) {
    return responderError(res, error, 'eliminar la incertidumbre');
  }
});

module.exports = router;