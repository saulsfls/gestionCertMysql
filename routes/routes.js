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
  obtenerCertificadoEquipmentId,
  eliminarCertificado
} = require('../controllers/basedatos');

// Controlador para el procesamiento de la imagen
const { procesarTabla } = require('../controllers/pimage');

//Rutas de procesamiento de la imgen 
//Se desactiva temporalmente la ruta de procesamiento de la imagen, ya que no se está utilizando en el proyecto actual.
//router.post('/procesar-tabla', procesarTabla);

//Rutas de la base de datos
router.post('/nuevo', async (req, res) => {
  try {
    const nuevoCertificado = await crearCertificado(req.body);
    res.status(201).json({
      ok: true,
      data: nuevoCertificado
    });
  } catch (error) {
    console.error('Error al guardar el certificado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error en el servidor al guardar el certificado'
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

module.exports = router;