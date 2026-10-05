const mariadb = require('mariadb');
require('dotenv').config();

// Configuración del pool de conexiones para MariaDB
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  connectionLimit: 5
});

// Crear un nuevo certificado
async function crearCertificado(datosCertificado) {
  const {
    cc,
    equipment_id,
    name_equipment,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active,
    data
  } = datosCertificado;

  const query = `
    INSERT INTO certificados (
      cc,
      equipment_id,
      name_equipment,
      date_cal,
      date_cc,
      calibration_interval,
      resolution,
      entity,
      cert_type,
      comments,
      active,
      data
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  const values = [
    cc,
    equipment_id,
    name_equipment,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active ?? true,
    data ? JSON.stringify(data) : null
  ];

  try {
    const res = await pool.query(query, values);
    // Retornamos el elemento insertado obteniéndolo con el insertId generado
    return await obtenerCertificadoId(res.insertId);
  } catch (err) {
    console.error('Error al insertar certificado:', err);
    throw err;
  }
}

// Obtener todos los certificados
async function obtenerCertificados() {
  //console.log('Obteniendo todos los certificados...');
  const query = 'SELECT * FROM certificados ORDER BY id DESC;';
  try {
    const rows = await pool.query(query);
    return rows;
  } catch (err) {
    console.error('Error al obtener certificados:', err);
    throw err;
  }
}

// Obtener un certificado por su ID autoincremental
async function obtenerCertificadoId(id) {
  const query = 'SELECT * FROM certificados WHERE id = ?;';
  try {
    const rows = await pool.query(query, [id]);
    return rows[0];
  } catch (err) {
    console.error('Error al obtener el certificado por ID:', err);
    throw err;
  }
}

// Obtener un certificado por equipment_id
async function obtenerCertificadoEquipmentId(equipmentId) {
  const query = 'SELECT * FROM certificados WHERE equipment_id = ?;';
  try {
    const rows = await pool.query(query, [equipmentId]);
    return rows[0];
  } catch (err) {
    console.error('Error al obtener el certificado por equipment_id:', err);
    throw err;
  }
}

// Desactivar un certificado
async function desactivarCertificado(id) {
  const query = 'UPDATE certificados SET active = false WHERE id = ?;';
  try {
    await pool.query(query, [id]);
    return await obtenerCertificadoId(id);
  } catch (err) {
    console.error('Error al desactivar el certificado:', err);
    throw err;
  }
}

// Activar un certificado
async function activarCertificado(id) {
  const query = 'UPDATE certificados SET active = true WHERE id = ?;';
  try {
    await pool.query(query, [id]);
    return await obtenerCertificadoId(id);
  } catch (err) {
    console.error('Error al activar el certificado:', err);
    throw err;
  }
}

// Modificar un certificado existente por su ID
async function modificarCertificado(id, datosActualizados) {
  const {
    cc,
    equipment_id,
    name_equipment,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active,
    data,
  } = datosActualizados;

  const query = `
    UPDATE certificados 
    SET 
      cc = ?,
      equipment_id = ?,
      name_equipment = ?,
      date_cal = ?,
      date_cc = ?,
      calibration_interval = ?,
      resolution = ?,
      entity = ?,
      cert_type = ?,
      comments = ?,
      active = ?,
      data = ?
    WHERE id = ?;
  `;

  const values = [
    cc,
    equipment_id,
    name_equipment,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active ?? true,
    data ? JSON.stringify(data) : null,
    id
  ];

  try {
    await pool.query(query, values);
    return await obtenerCertificadoId(id);
  } catch (err) {
    console.error('Error al modificar el certificado:', err);
    throw err;
  }
}

// Eliminar un certificado
async function eliminarCertificado(id) {
  try {
    const certificado = await obtenerCertificadoId(id);
    if (!certificado) return null;

    const query = 'DELETE FROM certificados WHERE id = ?;';
    await pool.query(query, [id]);
    return certificado;
  } catch (err) {
    console.error('Error al eliminar el certificado:', err);
    throw err;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  crearCertificado,
  obtenerCertificados,
  obtenerCertificadoId,
  obtenerCertificadoEquipmentId,
  desactivarCertificado,
  activarCertificado,
  modificarCertificado,
  eliminarCertificado
};