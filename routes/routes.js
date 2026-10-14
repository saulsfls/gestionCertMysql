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
} = require('../controllers/basedatos');
//El procesamiento de la tabla se hace en un servidor externo, por lo que no es necesario procesar la tabla en este archivo.
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

    const code     = error.code     ?? null;   // 'ER_DUP_ENTRY'
    const errno    = error.errno    ?? null;   // 1062
    const sqlState = error.sqlState ?? null;   // '23000'
    const message  = error.message  ?? '';
    const detail   = error.sqlMessage ?? error.detail ?? '';
    const column   = error.column   ?? null;

    // ─── Folio / registro duplicado (MySQL: ER_DUP_ENTRY / 1062) ───
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
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: mensajeAmigable,
        detail
      });
    }

    // ─── Llave foránea inválida (1452 / 1216 / 1217) ───
    if (errno === 1452 || errno === 1216 || errno === 1217) {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'La entidad o equipo referenciado no existe en el sistema.',
        detail
      });
    }

    // ─── Campo NOT NULL sin valor (1048) ───
    if (errno === 1048) {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'Falta un campo obligatorio para poder guardar el certificado.',
        detail
      });
    }

    // ─── CHECK constraint (3819) ───
    if (errno === 3819) {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'Un valor no cumple con las restricciones definidas en la base de datos.',
        detail
      });
    }

    // ─── Formato de dato inválido (1366 / 1292) ───
    if (errno === 1366 || errno === 1292) {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'Revisa el formato de fechas y valores numéricos antes de guardar.',
        detail
      });
    }

    // ─── Valor fuera de rango o demasiado largo (1264 / 1406) ───
    if (errno === 1264 || errno === 1406) {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'Alguno de los valores excede el tamaño permitido en la base de datos.',
        detail
      });
    }

    // ─── Error genérico de integridad (sqlState 23000) ───
    if (sqlState === '23000') {
      return res.status(400).json({
        ok: false,
        code,
        errno,
        sqlState,
        column,
        message: 'Alguno de los datos no cumple con las restricciones de la base de datos.',
        detail
      });
    }

    // ─── Cualquier otro error inesperado del servidor ───
    return res.status(500).json({
      ok: false,
      code,
      errno,
      sqlState,
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

// PUT: Desactivar certificado
router.put('/certificados/:id/desactivar', async (req, res) => {
  try {
    const { id } = req.params;
    const certificado = await desactivarCertificado(id);
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

// PUT: Activar certificado
router.put('/certificados/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const certificado = await activarCertificado(id);
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