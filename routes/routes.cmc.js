const express = require('express');
const router = express.Router();

// Controladores de la base de datos para CMC
const { 
  crearCmc, 
  obtenerCmcs, 
  obtenerCmcId, 
  obtenerCmcPorIdEquipo,
  desactivarCmc, 
  activarCmc, 
  eliminarCmc
} = require('../controllers/cmc-data'); // Ajusta la ruta a tu controlador

// POST: Guardar un nuevo cálculo de CMC
router.post('/cmc/nuevo', async (req, res) => {
  try {
    const nuevoCmc = await crearCmc(req.body);
    return res.status(201).json({
      ok: true,
      data: nuevoCmc
    });
  } catch (error) {
    console.error('Error al guardar el cálculo de CMC:', error);

    const code     = error.code     ?? null;
    const errno    = error.errno    ?? null;
    const sqlState = error.sqlState ?? null;
    const message  = error.message  ?? '';
    const detail   = error.sqlMessage ?? error.detail ?? '';

    // ─── Campo NOT NULL sin valor (1048) ───
    if (errno === 1048) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, message: 'Falta un campo obligatorio para poder guardar el cálculo del CMC.', detail
      });
    }

    // ─── Formato de dato inválido (1366 / 1292) ───
    if (errno === 1366 || errno === 1292) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, message: 'Revisa el formato de los valores numéricos antes de guardar.', detail
      });
    }

    // ─── Valor fuera de rango o demasiado largo (1264 / 1406) ───
    if (errno === 1264 || errno === 1406) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, message: 'Alguno de los valores excede el tamaño permitido en la base de datos.', detail
      });
    }

    // ─── Error genérico de integridad ───
    if (sqlState === '23000') {
      return res.status(400).json({
        ok: false, code, errno, sqlState, message: 'Alguno de los datos no cumple con las restricciones de la base de datos.', detail
      });
    }

    // ─── Cualquier otro error inesperado del servidor ───
    return res.status(500).json({
      ok: false, code, errno, sqlState, message: 'Error en el servidor al guardar el cálculo del CMC.',
      detail: process.env.NODE_ENV === 'development' ? (detail || message) : undefined
    });
  }
});

// GET: Obtener todos los cálculos de CMC
router.get('/cmc', async (req, res) => {
  try {
    const cmcs = await obtenerCmcs();
    res.status(200).json({
      ok: true,
      total: cmcs.length,
      data: cmcs
    });
  } catch (error) {
    console.error('Error al consultar cálculos de CMC:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al obtener la lista de cálculos de CMC'
    });
  }
});

// GET: Obtener un cálculo de CMC por ID
router.get('/cmc/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cmc = await obtenerCmcId(id);

    if (!cmc) {
      return res.status(404).json({
        ok: false,
        message: 'Cálculo de CMC no encontrado'
      });
    }

    res.status(200).json({
      ok: true,
      data: cmc
    });
  } catch (error) {
    console.error('Error al consultar el cálculo de CMC:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al consultar el cálculo de CMC'
    });
  }
});

// GET: Obtener los cálculos de CMC asociados a un equipo específico
router.get('/cmc/equipo/:id_equipment', async (req, res) => {
  try {
    const { id_equipment } = req.params;
    const cmcs = await obtenerCmcPorEquipo(id_equipment);

    if (!cmcs || cmcs.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `No se encontraron cálculos de CMC para el equipo ${id_equipment}`
      });
    }

    res.status(200).json({
      ok: true,
      total: cmcs.length,
      data: cmcs
    });
  } catch (error) {
    console.error('Error al obtener cálculos de CMC del equipo:', error);
    res.status(500).json({
      ok: false,
      message: 'Error en el servidor al obtener los cálculos del equipo'
    });
  }
});

// PUT: Desactivar cálculo de CMC (Baja lógica)
router.put('/cmc/:id/desactivar', async (req, res) => {
  try {
    const { id } = req.params;
    const cmc = await desactivarCmc(id);
    res.status(200).json({
      ok: true,
      data: cmc
    });
  } catch (error) {
    console.error('Error al desactivar el cálculo de CMC:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al desactivar el cálculo de CMC'
    });
  }
});

// PUT: Activar cálculo de CMC
router.put('/cmc/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const cmc = await activarCmc(id);
    res.status(200).json({
      ok: true,
      data: cmc
    });
  } catch (error) {
    console.error('Error al activar el cálculo de CMC:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al activar el cálculo de CMC'
    });
  }
});

// DELETE: Eliminar un cálculo de CMC de forma permanente
router.delete('/cmc/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;
    const cmcEliminado = await eliminarCmc(id);

    if (!cmcEliminado) {
      return res.status(404).json({
        ok: false,
        message: 'Cálculo de CMC no encontrado para eliminar'
      });
    }

    res.status(200).json({
      ok: true,
      data: cmcEliminado
    });
  } catch (error) {
    console.error('Error al eliminar el cálculo de CMC:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al eliminar el cálculo de CMC'
    });
  }
});

module.exports = router;