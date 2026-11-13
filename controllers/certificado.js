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

// -----------------------------------------------------------------------------
// Helper: obtiene el usuario que realiza la acción, enviado desde el front.
// Busca en varios nombres por flexibilidad (actor_id, updated_by, created_by,
// username, user). Si no viene, cae a 'system'.
// -----------------------------------------------------------------------------
function getActor(body) {
  if (!body) return 'system';
  return (
    body.actor_id ||
    body.updated_by ||
    body.created_by ||
    body.username ||
    body.user ||
    'system'
  );
}

// Crear un nuevo certificado
async function crearCertificado(datosCertificado) {
  const {
    cc,
    equipment_id,
    name_equipment,
    id_user,
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

  const actor = getActor(datosCertificado);

  const query = `
    INSERT INTO certificados (
      cc, equipment_id, name_equipment, id_user, date_cal, date_cc,
      calibration_interval, resolution, entity, cert_type,
      comments, active, data,
      created_at, created_by, updated_at, updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?);
  `;

  const values = [
    cc,
    equipment_id,
    name_equipment,
    id_user,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active ?? true,
    data ? JSON.stringify(data) : null,
    actor,   // created_by
    actor    // updated_by
  ];

  try {
    const res = await pool.query(query, values);
    return await obtenerCertificadoId(res.insertId);
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
async function desactivarCertificado(id, actor = 'system') {
  const query = `
    UPDATE certificados
    SET active = false,
        updated_at = NOW(),
        updated_by = ?
    WHERE id = ?;
  `;
  try {
    await pool.query(query, [actor, id]);
    return await obtenerCertificadoId(id);
  } catch (err) {
    console.error('Error al desactivar el certificado:', err);
    throw err;
  }
}

// Activar un certificado
async function activarCertificado(id, actor = 'system') {
  const query = `
    UPDATE certificados
    SET active = true,
        updated_at = NOW(),
        updated_by = ?
    WHERE id = ?;
  `;
  try {
    await pool.query(query, [actor, id]);
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
    id_user,
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

  const actor = getActor(datosActualizados);

  const query = `
    UPDATE certificados 
    SET 
      cc = ?,
      equipment_id = ?,
      name_equipment = ?,
      id_user = ?,
      date_cal = ?,
      date_cc = ?,
      calibration_interval = ?,
      resolution = ?,
      entity = ?,
      cert_type = ?,
      comments = ?,
      active = ?,
      data = ?,
      updated_at = NOW(),
      updated_by = ?
    WHERE id = ?;
  `;

  const values = [
    cc,
    equipment_id,
    name_equipment,
    id_user,
    date_cal,
    date_cc,
    calibration_interval,
    resolution,
    entity,
    cert_type,
    comments,
    active ?? true,
    data ? JSON.stringify(data) : null,
    actor,   // updated_by
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
async function obtenerEquipmentId() {
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
      date_cal, date_cc, entity, cert_type, active, data,
      created_at, created_by, updated_at, updated_by
    FROM certificados
    WHERE equipment_id = ?
      AND data IS NOT NULL
    ORDER BY date_cal DESC, id DESC;
  `;

  try {
    const rows = await pool.query(query, [equipmentId]);
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
        const filas = t.rows || t.data || t.values || t.measurements || [];

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

          created_at:      row.created_at,
          created_by:      row.created_by,
          updated_at:      row.updated_at,
          updated_by:      row.updated_by,

          table_id:               t.table_id,
          cc_id:                  t.cc_id,
          title:                  t.title,
          parameter:              t.parameter,
          unit:                   t.unit,
          range:                  t.range,
          pt:                     t.pt,
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
      active,
      created_at, created_by, updated_at, updated_by
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