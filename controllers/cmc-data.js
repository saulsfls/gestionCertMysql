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

// Crear un nuevo registro de cálculo de CMC
async function crearCmc(datosCmc) {
  console.log(datosCmc.id_user);
  const {
    id_equipment,
    id_user,
    value_ref_min,
    value_ref_max,
    interval_value,
    cert_associate,
    active,
    u_combined,
    degrees_freedom,
    coefficient_expansion,
    u_expanded,
    stability,
    bias,
    drift,
    u_reference,
    s_reference,
    repeatability,
    reproducibility
  } = datosCmc;

  const query = `
    INSERT INTO cmc_data (
      id_equipment, id_user, value_ref_min, value_ref_max, interval_value, cert_associate,
      active, u_combined, degrees_freedom, coefficient_expansion, u_expanded,
      stability, bias, drift, u_reference, s_reference, repeatability, reproducibility
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  const values = [
    id_equipment,
    id_user,
    value_ref_min,
    value_ref_max,
    interval_value,
    cert_associate,
    active ?? 1, // Por defecto activo si no se especifica
    u_combined,
    degrees_freedom,
    coefficient_expansion,
    u_expanded,
    stability,
    bias,
    drift,
    u_reference,
    s_reference,
    repeatability,
    reproducibility
  ];

  try {
    const res = await pool.query(query, values);
    return await obtenerCmcId(res.insertId);
  } catch (err) {
    console.error('Error al insertar cálculo de CMC:', err);

    const wrapped = new Error(err.message);
    wrapped.code       = err.code;
    wrapped.errno      = err.errno;
    wrapped.sqlState   = err.sqlState;
    wrapped.sqlMessage = err.sqlMessage ?? err.message;
    throw wrapped;
  }
}

// Obtener todos los cálculos de CMC
async function obtenerCmcs() {
  const query = 'SELECT * FROM cmc_data ORDER BY id DESC;';
  try {
    const rows = await pool.query(query);
    return rows;
  } catch (err) {
    console.error('Error al obtener los cálculos de CMC:', err);
    throw err;
  }
}

// Obtener un cálculo de CMC por su ID autoincremental
async function obtenerCmcId(id) {
  const query = 'SELECT * FROM cmc_data WHERE id = ?;';
  try {
    const rows = await pool.query(query, [id]);
    return rows[0];
  } catch (err) {
    console.error('Error al obtener el cálculo de CMC por ID:', err);
    throw err;
  }
}

// Obtener todos los cálculos asociados a un equipo específico
async function obtenerCmcPorIdEquipo(id_equipment) {
  const query = 'SELECT * FROM cmc_data WHERE id_equipment = ? ORDER BY created_at DESC;';
  try {
    const rows = await pool.query(query, [id_equipment]);
    return rows;
  } catch (err) {
    console.error('Error al obtener cálculos de CMC por equipo:', err);
    throw err;
  }
}

// Desactivar un cálculo de CMC (Soft Delete)
async function desactivarCmc(id) {
  const query = 'UPDATE cmc_data SET active = 0 WHERE id = ?;';
  try {
    await pool.query(query, [id]);
    return await obtenerCmcId(id);
  } catch (err) {
    console.error('Error al desactivar el cálculo de CMC:', err);
    throw err;
  }
}

// Activar un cálculo de CMC
async function activarCmc(id) {
  const query = 'UPDATE cmc_data SET active = 1 WHERE id = ?;';
  try {
    await pool.query(query, [id]);
    return await obtenerCmcId(id);
  } catch (err) {
    console.error('Error al activar el cálculo de CMC:', err);
    throw err;
  }
}

// Eliminar permanentemente un cálculo de CMC (Usar con precaución)
async function eliminarCmc(id) {
  try {
    const cmc = await obtenerCmcId(id);
    if (!cmc) return null;

    const query = 'DELETE FROM cmc_data WHERE id = ?;';
    await pool.query(query, [id]);
    return cmc;
  } catch (err) {
    console.error('Error al eliminar el cálculo de CMC:', err);
    throw err;
  }
}

// Exportar las funciones para ser usadas en las rutas
module.exports = {
  crearCmc,
  obtenerCmcs,
  obtenerCmcId,
  obtenerCmcPorIdEquipo,
  desactivarCmc,
  activarCmc,
  eliminarCmc
};