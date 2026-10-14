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
      cc, equipment_id, name_equipment, date_cal, date_cc,
      calibration_interval, resolution, entity, cert_type,
      comments, active, data
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
    const res = await pool.query(query, values);       // sin [ ]
    return await obtenerCertificadoId(res.insertId);   // res.insertId directo
  } catch (err) {
    console.error('Error al insertar certificado:', err);

    const wrapped = new Error(err.message);
    wrapped.code       = err.code;
    wrapped.errno      = err.errno;
    wrapped.sqlState   = err.sqlState;
    wrapped.sqlMessage = err.sqlMessage ?? err.message;
    wrapped.column     = err.sqlMessage?.match(/for key '([^']+)'/)?.[1]
                      ?? err.message?.match(/for key '([^']+)'/)?.[1]
                      ?? null;
    throw wrapped;
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

// Obtener todos los equipment_id que tienen certificados asociados
async function obtenerEquipmentId() { //Muestra todos los equipment_id que tienen certificados asociados, para poder filtrar en la tabla de certificados.
  const query = `
    SELECT DISTINCT equipment_id
    FROM certificados
    WHERE equipment_id IS NOT NULL
      AND equipment_id <> ''
    ORDER BY equipment_id ASC;
  `;

  try {
    const rows = await pool.query(query);
    return rows.map(r => r.equipment_id);
  } catch (err) {
    console.error('Error al obtener equipment_ids:', err);
    throw err;
  }
}

// Obtener todas las tablas de resultados asociadas a un equipment_id
async function obtenerTablas(equipmentId) {
  const query = `
    SELECT
      id, cc, equipment_id, name_equipment,
      date_cal, date_cc, entity, cert_type, active, data
    FROM certificados
    WHERE equipment_id = ?
      AND data IS NOT NULL
    ORDER BY date_cal DESC, id DESC;
  `;

  try {
    const rows = await pool.query(query, [equipmentId]);   // 👈 AQUÍ el fix
    const tablas = [];

    for (const row of rows) {
      let payload;
      try {
        payload = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch (e) {
        console.warn(`Certificado ${row.id} (cc=${row.cc}) tiene 'data' inválido, se omite.`);
        continue;
      }

      const resultTables = payload?.['Result Tables'] || [];

      for (const t of resultTables) {
        const filas =
          t.rows ||
          t.data ||
          t.values ||
          t.measurements ||
          [];

        tablas.push({
          certificado_id:  row.id,
          cc:              row.cc,
          equipment_id:    row.equipment_id,
          name_equipment:  row.name_equipment,
          date_cal:        row.date_cal,
          date_cc:         row.date_cc,
          entity:          row.entity,
          cert_type:       row.cert_type,
          active:          !!row.active,

          table_id:               t.table_id,
          cc_id:                  t.cc_id,
          title:                  t.title,
          parameter:              t.parameter,
          unit:                   t.unit,
          range:                  t.range,
          cmc:                    t.cmc,
          calibration_equation:   t.calibration_equation,
          comments:               t.comments,
          columns:                t.columns || [],
          rows:                   filas
        });
      }
    }

    return tablas;
  } catch (err) {
    console.error('Error al obtener tablas por equipment_id:', err);
    throw err;
  }
}

// Obtener un certificado por su cc (folio) sin traer la columna data
async function obtenerCertificadoCc(cc) {
  const query = `
    SELECT
      id,
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
      active
    FROM certificados
    WHERE cc = ?
    LIMIT 1;
  `;

  try {
    const rows = await pool.query(query, [cc]);
    return rows[0] ?? null;
  } catch (err) {
    console.error('Error al obtener certificado por cc:', err);
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
  eliminarCertificado,
  obtenerEquipmentId,
  obtenerTablas,
  obtenerCertificadoCc
};