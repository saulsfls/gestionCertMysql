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


// Crear una nueva incertidumbre
// Body esperado (inglés, alineado a la tabla):
// { clave, name, description, type, distribution, obsolete }

async function crearIncertidumbre(datosIncertidumbre) {
  const {
    clave,
    name,
    description,
    type,
    distribution,
    obsolete
  } = datosIncertidumbre;

  const query = `
    INSERT INTO uncertainties (
      clave, name, description, type, distribution, obsolete
    )
    VALUES (?, ?, ?, ?, ?, ?);
  `;

  const values = [
    clave,
    name,
    description,
    type,
    distribution,
    obsolete ?? 0
  ];

  try {
    const res = await pool.query(query, values);
    return await obtenerIncertidumbreId(res.insertId);
  } catch (err) {
    console.error('Error al insertar incertidumbre:', err);

    const wrapped = new Error(err.message);
    wrapped.code       = err.code;
    wrapped.errno      = err.errno;
    wrapped.sqlState   = err.sqlState;
    wrapped.sqlMessage = err.sqlMessage ?? err.message;
    throw wrapped;
  }
}


// Obtener todas (por defecto oculta obsoletas)

async function obtenerIncertidumbres(incluirObsoletos = false) {
  const query = incluirObsoletos
    ? 'SELECT * FROM uncertainties ORDER BY id ASC;'
    : 'SELECT * FROM uncertainties WHERE obsolete = 0 ORDER BY id ASC;';
  try {
    const rows = await pool.query(query);
    return rows;
  } catch (err) {
    console.error('Error al obtener incertidumbres:', err);
    throw err;
  }
}


// Obtener por ID (incluye obsoletas para auditoría/reactivación)

async function obtenerIncertidumbreId(id) {
  const query = 'SELECT * FROM uncertainties WHERE id = ?;';
  try {
    const rows = await pool.query(query, [id]);
    return rows[0];
  } catch (err) {
    console.error('Error al obtener la incertidumbre por ID:', err);
    throw err;
  }
}


// Obtener por clave (UNIQUE, solo activas)

async function obtenerIncertidumbrePorClave(clave) {
  const query = 'SELECT * FROM uncertainties WHERE clave = ? AND obsolete = 0;';
  try {
    const rows = await pool.query(query, [clave]);
    return rows[0];
  } catch (err) {
    console.error('Error al obtener la incertidumbre por clave:', err);
    throw err;
  }
}


// Filtrar por tipo ('TIPO A' / 'TIPO B')

async function obtenerIncertidumbresPorTipo(type, incluirObsoletos = false) {
  const query = incluirObsoletos
    ? 'SELECT * FROM uncertainties WHERE type = ? ORDER BY id ASC;'
    : 'SELECT * FROM uncertainties WHERE type = ? AND obsolete = 0 ORDER BY id ASC;';
  try {
    const rows = await pool.query(query, [type]);
    return rows;
  } catch (err) {
    console.error('Error al obtener incertidumbres por tipo:', err);
    throw err;
  }
}


// Filtrar por distribución

async function obtenerIncertidumbresPorDistribucion(distribution, incluirObsoletos = false) {
  const query = incluirObsoletos
    ? 'SELECT * FROM uncertainties WHERE distribution = ? ORDER BY id ASC;'
    : 'SELECT * FROM uncertainties WHERE distribution = ? AND obsolete = 0 ORDER BY id ASC;';
  try {
    const rows = await pool.query(query, [distribution]);
    return rows;
  } catch (err) {
    console.error('Error al obtener incertidumbres por distribución:', err);
    throw err;
  }
}


// Actualización PARCIAL dinámica (compatible con PATCH del router)
// Recibe un objeto con columnas en inglés; solo actualiza las presentes.

async function actualizarIncertidumbre(id, datosIncertidumbre) {
  const CAMPOS_PERMITIDOS = ['clave', 'name', 'description', 'type', 'distribution', 'obsolete'];

  const campos = [];
  const values = [];

  for (const campo of CAMPOS_PERMITIDOS) {
    const valor = datosIncertidumbre[campo];
    if (valor !== undefined) {
      campos.push(`${campo} = ?`);
      values.push(campo === 'obsolete' ? Number(valor) : valor);
    }
  }

  if (campos.length === 0) return null;

  values.push(id);
  const query = `UPDATE uncertainties SET ${campos.join(', ')} WHERE id = ?;`;

  try {
    const res = await pool.query(query, values);
    if (res.affectedRows === 0) return null;
    return await obtenerIncertidumbreId(id);
  } catch (err) {
    console.error('Error al actualizar la incertidumbre:', err);

    const wrapped = new Error(err.message);
    wrapped.code       = err.code;
    wrapped.errno      = err.errno;
    wrapped.sqlState   = err.sqlState;
    wrapped.sqlMessage = err.sqlMessage ?? err.message;
    throw wrapped;
  }
}


// Baja lógica (obsolete = 1)

async function desactivarIncertidumbre(id) {
  const query = 'UPDATE uncertainties SET obsolete = 1 WHERE id = ?;';
  try {
    const res = await pool.query(query, [id]);
    if (res.affectedRows === 0) return null;
    return await obtenerIncertidumbreId(id);
  } catch (err) {
    console.error('Error al marcar la incertidumbre como obsoleta:', err);
    throw err;
  }
}


// Reactivar (obsolete = 0)

async function activarIncertidumbre(id) {
  const query = 'UPDATE uncertainties SET obsolete = 0 WHERE id = ?;';
  try {
    const res = await pool.query(query, [id]);
    if (res.affectedRows === 0) return null;
    return await obtenerIncertidumbreId(id);
  } catch (err) {
    console.error('Error al reactivar la incertidumbre:', err);
    throw err;
  }
}


// Borrado físico

async function eliminarIncertidumbre(id) {
  try {
    const incertidumbre = await obtenerIncertidumbreId(id);
    if (!incertidumbre) return null;

    const query = 'DELETE FROM uncertainties WHERE id = ?;';
    await pool.query(query, [id]);
    return incertidumbre;
  } catch (err) {
    console.error('Error al eliminar la incertidumbre:', err);

    const wrapped = new Error(err.message);
    wrapped.code       = err.code;
    wrapped.errno      = err.errno;
    wrapped.sqlState   = err.sqlState;
    wrapped.sqlMessage = err.sqlMessage ?? err.message;
    throw wrapped;
  }
}


// Exportar con los MISMOS nombres que el router ya importa

module.exports = {
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
};