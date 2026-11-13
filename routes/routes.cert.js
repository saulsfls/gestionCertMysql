const express = require('express');
const router = express.Router();

// Controladores existentes de base de datos
const { 
  crearCertificado, 
  obtenerCertificadoId, 
  obtenerCertificados, 
  desactivarCertificado, 
  activarCertificado, 
  modificarCertificado,
  eliminarCertificado,
  obtenerEquipmentId,
  obtenerTablas,
  obtenerCertificadoCc
} = require('../controllers/certificado');

// -----------------------------------------------------------------------------
// Helper local: extrae el actor del body para los endpoints que no reciben
// el objeto completo del certificado (activar / desactivar).
// -----------------------------------------------------------------------------
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

//Rutas de la base de datos
router.post('/nuevo', async (req, res) => {
  try {
    const nuevoCertificado = await crearCertificado(req.body);
    return res.status(201).json({
      ok: true,
      data: nuevoCertificado
    });
  } catch (error) {
    console.error('Error al guardar el certificado:', error);

    const code     = error.code     ?? null;
    const errno    = error.errno    ?? null;
    const sqlState = error.sqlState ?? null;
    const message  = error.message  ?? '';
    const detail   = error.sqlMessage ?? error.detail ?? '';
    const column   = error.column   ?? null;

    if (code === 'ER_DUP_ENTRY' || errno === 1062) {
      const texto = `${message} ${detail} ${column}`.toLowerCase();
      let mensajeAmigable = 'El registro ya existe en la base de datos. Verifica los datos e inténtalo de nuevo.';

      if (texto.includes('cc') || texto.includes('folio')) {
        mensajeAmigable =
          `El folio "${req.body?.cc ?? ''}" ya se encuentra registrado en el sistema. ` +
          `Por favor, utiliza uno diferente o verifica el número.`;
      } else if (texto.includes('equipment_id')) {
        mensajeAmigable =
          `Ya existe un certificado para el equipo "${req.body?.equipment_id ?? ''}". ` +
          `Verifica los datos antes de continuar.`;
      }

      return res.status(409).json({
        ok: false, code, errno, sqlState, column,
        message: mensajeAmigable, detail
      });
    }

    if (errno === 1452 || errno === 1216 || errno === 1217) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, column,
        message: 'La entidad o equipo referenciado no existe en el sistema.',
        detail
      });
    }

    if (errno === 1048) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, column,
        message: 'Falta un campo obligatorio para poder guardar el certificado.',
        detail
      });
    }

    if (errno === 3819) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, column,
        message: 'Un valor no cumple con las restricciones definidas en la base de datos.',
        detail
      });
    }

    if (errno === 1366 || errno === 1292) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, column,
        message: 'Revisa el formato de fechas y valores numéricos antes de guardar.',
        detail
      });
    }

    if (errno === 1264 || errno === 1406) {
      return res.status(400).json({
        ok: false, code, errno, sqlState, column,
        message: 'Alguno de los valores excede el tamaño permitido en la base de datos.',
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

    return res.status(500).json({
      ok: false, code, errno, sqlState,
      message: 'Error en el servidor al guardar el certificado.',
      detail: process.env.NODE_ENV === 'development' ? (detail || message) : undefined
    });
  }
});

// GET: Obtener todos los certificados
router.get('/certificados', async (req, res) => {
  try {
    const certificados = await obtenerCertificados();
    res.status(200).json({
      ok: true,
      total: certificados.length,
      data: certificados
    });
  } catch (error) {
    console.error('Error al consultar certificados:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al obtener la lista de certificados'
    });
  }
});

// GET: Obtener un certificado por ID
router.get('/certificados/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const certificado = await obtenerCertificadoId(id);

    if (!certificado) {
      return res.status(404).json({
        ok: false,
        message: 'Certificado no encontrado'
      });
    }

    res.status(200).json({
      ok: true,
      data: certificado
    });
  } catch (error) {
    console.error('Error al consultar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al consultar el certificado'
    });
  }
});

// PUT: Desactivar certificado  ← ahora pasa el actor
router.put('/certificados/:id/desactivar', async (req, res) => {
  try {
    const { id } = req.params;
    const actor = getActorFromBody(req.body);
    const certificado = await desactivarCertificado(id, actor);
    res.status(200).json({
      ok: true,
      data: certificado
    });
  } catch (error) {
    console.error('Error al desactivar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al desactivar el certificado'
    });
  }
});

// PUT: Activar certificado  ← ahora pasa el actor
router.put('/certificados/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const actor = getActorFromBody(req.body);
    const certificado = await activarCertificado(id, actor);
    res.status(200).json({
      ok: true,
      data: certificado
    });
  } catch (error) {
    console.error('Error al activar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al activar el certificado'
    });
  }
});

// PUT: Modificar/Guardar cambios de un certificado
// El actor se toma automáticamente en el controlador (getActor busca
// actor_id / updated_by / created_by / username / user dentro del body).
router.put('/certificados/:id/save', async (req, res) => {
  try {
    const { id } = req.params;
    const certificado = await modificarCertificado(id, req.body);
    res.status(200).json({
      ok: true,
      data: certificado
    });
  } catch (error) {
    console.error('Error al modificar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al modificar el certificado'
    });
  }
});

// DELETE: Eliminar un certificado
router.delete('/certificados/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;
    const certificadoEliminado = await eliminarCertificado(id);

    res.status(200).json({
      ok: true,
      data: certificadoEliminado
    });
  } catch (error) {
    console.error('Error al eliminar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al eliminar el certificado'
    });
  }
});

// Devuelve la lista de equipment_id que tienen certificados asociados
router.get('/equipos', async (req, res) => {
  try {
    const equipos = await obtenerEquipmentId();
    res.status(200).json({
      ok: true,
      data: equipos
    });
  } catch (error) {
    console.error('Error al obtener los equipment_id:', error);
    res.status(500).json({
      ok: false,
      message: 'Error en el servidor al obtener los equipos'
    });
  }
});

// Devuelve todas las tablas de resultados asociadas a un equipment_id
router.get('/equipos/:equipmentId/tablas', async (req, res) => {
  try {
    const { equipmentId } = req.params;
    const tablas = await obtenerTablas(equipmentId);

    if (!tablas || tablas.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `No se encontraron tablas para el equipo ${equipmentId}`
      });
    }

    res.status(200).json({
      ok: true,
      total: tablas.length,
      data: tablas
    });
  } catch (error) {
    console.error('Error al obtener tablas del equipo:', error);
    res.status(500).json({
      ok: false,
      message: 'Error en el servidor al obtener las tablas del equipo'
    });
  }
});

router.get('/certificados/cc/:cc', async (req, res) => {
  try {
    const { cc } = req.params;
    const certificado = await obtenerCertificadoCc(cc);

    if (!certificado) {
      return res.status(404).json({
        ok: false,
        message: `Certificado con cc ${cc} no encontrado`
      });
    }

    res.status(200).json({
      ok: true,
      data: certificado
    });
  } catch (error) {
    console.error('Error al obtener certificado por cc:', error);
    res.status(500).json({
      ok: false,
      message: 'Error en el servidor al obtener el certificado'
    });
  }
});

module.exports = router;