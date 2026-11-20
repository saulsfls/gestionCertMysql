const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  connectionLimit: 5
});

const NOW_MEXICO = "CONVERT_TZ(NOW(), 'UTC', 'America/Mexico_City')";


// ============================================================
// HELPERS INTERNOS
// ============================================================

/**
 * Normaliza un string a slug: minúsculas, sin acentos, solo [a-z0-9_].
 * Ej: "Tensión DC" → "tension_dc"
 */
function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Compara dos displayNames ignorando mayúsculas, acentos y espacios extra.
 * "Tensión DC" === "tension dc" → true
 */
function mismoDisplay(a, b) {
  const norm = s => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return norm(a) === norm(b);
}

/**
 * Envuelve errores de MariaDB con los campos que el frontend espera
 * (code, errno, sqlState, sqlMessage, column).
 */
function wrapError(err) {
  const wrapped = new Error(err.message);
  wrapped.code       = err.code;
  wrapped.errno      = err.errno;
  wrapped.sqlState   = err.sqlState;
  wrapped.sqlMessage = err.sqlMessage ?? err.message;
  wrapped.column     = err.sqlMessage?.match(/for key '([^']+)'/)?.[1]
                    ?? err.message?.match(/for key '([^']+)'/)?.[1]
                    ?? null;
  return wrapped;
}

/**
 * Lee una fila del catálogo por id ('titulos' | 'unidades') dentro de una
 * transacción con FOR UPDATE para evitar carreras entre usuarios concurrentes.
 */
async function leerFilaParaActualizar(conn, id) {
  const rows = await conn.query(
    'SELECT data FROM catalog_units_titles WHERE id = ? FOR UPDATE;',
    [id]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error(`Catálogo "${id}" no existe.`), {
      code: 'CATALOGO_NO_EXISTE',
      status: 404,
    });
  }
  const raw = rows[0].data;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { raw, data };
}

/**
 * Actualiza la fila del catálogo con el nuevo objeto y sella updated_at
 * en hora de México.
 */
async function escribirFila(conn, id, nuevoData) {
  await conn.query(
    `UPDATE catalog_units_titles
     SET data = ?,
         updated_at = ${NOW_MEXICO}
     WHERE id = ?;`,
    [JSON.stringify(nuevoData), id]
  );
}


// ============================================================
// LECTURA
// ============================================================

/**
 * Devuelve todo el catálogo anidado: { titulos: {...}, unidades: {...} }
 */
async function obtenerCatalogo() {
  const query = 'SELECT id, data FROM catalog_units_titles;';
  try {
    const rows = await pool.query(query);
    const resultado = { titulos: {}, unidades: {} };

    for (const row of rows) {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (row.id === 'titulos' || row.id === 'unidades') {
        resultado[row.id] = parsed;
      }
    }

    return resultado;
  } catch (err) {
    console.error('Error al obtener catálogo:', err);
    throw wrapError(err);
  }
}

/**
 * Devuelve solo la lista de títulos (sin el JSON de unidades).
 */
async function obtenerTitulos() {
  const query = "SELECT data FROM catalog_units_titles WHERE id = 'titulos';";
  try {
    const rows = await pool.query(query);
    if (rows.length === 0) return {};
    const raw = rows[0].data;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error('Error al obtener títulos:', err);
    throw wrapError(err);
  }
}

/**
 * Devuelve solo la lista de unidades por magnitud.
 */
async function obtenerUnidades() {
  const query = "SELECT data FROM catalog_units_titles WHERE id = 'unidades';";
  try {
    const rows = await pool.query(query);
    if (rows.length === 0) return {};
    const raw = rows[0].data;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error('Error al obtener unidades:', err);
    throw wrapError(err);
  }
}


// ============================================================
// CREAR TÍTULO
// ============================================================

async function crearTitulo(body) {
  const displayName = String(body?.displayName || '').trim();
  const label       = body?.label != null ? String(body.label).trim() : '';
  const magnitud    = String(body?.magnitud || '').trim();
  const subparametrosIniciales = Array.isArray(body?.subparametrosIniciales)
    ? body.subparametrosIniciales
    : [];

  if (!displayName) throw Object.assign(new Error('displayName es obligatorio.'), { status: 400 });
  if (displayName.length < 3 || displayName.length > 150) {
    throw Object.assign(new Error('displayName debe tener entre 3 y 150 caracteres.'), { status: 400 });
  }
  if (!magnitud) throw Object.assign(new Error('magnitud es obligatoria.'), { status: 400 });

  const id = slugify(displayName);
  if (!id) throw Object.assign(new Error('No se pudo generar un id válido desde displayName.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    for (const [existingId, t] of Object.entries(titulos)) {
      if (mismoDisplay(t.displayName, displayName)) {
        throw Object.assign(
          new Error(`Ya existe un título con displayName "${t.displayName}" (id: ${existingId}).`),
          { status: 409, code: 'DISPLAYNAME_DUPLICADO' }
        );
      }
    }

    if (titulos[id]) {
      throw Object.assign(
        new Error(`Ya existe un título con id "${id}".`),
        { status: 409, code: 'ID_DUPLICADO' }
      );
    }

    if (magnitud !== '*') {
      const unidadesRaw = (await conn.query(
        "SELECT data FROM catalog_units_titles WHERE id = 'unidades';"
      ))[0].data;
      const unidades = typeof unidadesRaw === 'string' ? JSON.parse(unidadesRaw) : unidadesRaw;
      if (!unidades[magnitud]) {
        throw Object.assign(
          new Error(`La magnitud "${magnitud}" no existe en el catálogo de unidades.`),
          { status: 400, code: 'MAGNITUD_INEXISTENTE' }
        );
      }
    }

    const subparametros = subparametrosIniciales.map((sp, idx) => {
      const spDisplay = String(sp?.displayName || '').trim();
      if (!spDisplay) {
        throw Object.assign(
          new Error(`subparametrosIniciales[${idx}].displayName es obligatorio.`),
          { status: 400 }
        );
      }
      const spId = slugify(spDisplay) || `sub_${idx + 1}`;
      return {
        id: spId,
        displayName: spDisplay,
        label: sp?.label != null ? String(sp.label).trim() : '',
        unidadesOverride: Array.isArray(sp?.unidadesOverride) && sp.unidadesOverride.length > 0
          ? sp.unidadesOverride
          : null,
      };
    });

    const seen = new Set();
    for (const sp of subparametros) {
      if (seen.has(sp.id)) {
        throw Object.assign(
          new Error(`id duplicado entre subparámetros iniciales: "${sp.id}".`),
          { status: 400 }
        );
      }
      seen.add(sp.id);
    }

    titulos[id] = {
      displayName,
      label,
      magnitud,
      subparametros,
    };

    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { id, ...titulos[id] };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al crear título:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// CREAR SUBPARÁMETRO
// ============================================================

async function crearSubparametro(body) {
  const tituloId    = String(body?.tituloId || '').trim();
  const displayName = String(body?.displayName || '').trim();
  const label       = body?.label != null ? String(body.label).trim() : '';
  const overrideRaw = body?.unidadesOverride;

  if (!tituloId) throw Object.assign(new Error('tituloId es obligatorio.'), { status: 400 });
  if (!displayName) throw Object.assign(new Error('displayName es obligatorio.'), { status: 400 });
  if (displayName.length < 2 || displayName.length > 150) {
    throw Object.assign(new Error('displayName debe tener entre 2 y 150 caracteres.'), { status: 400 });
  }

  const id = slugify(displayName);
  if (!id) throw Object.assign(new Error('No se pudo generar un id válido.'), { status: 400 });

  let unidadesOverride = null;
  if (Array.isArray(overrideRaw) && overrideRaw.length > 0) {
    unidadesOverride = overrideRaw.map(u => String(u).trim()).filter(Boolean);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    const titulo = titulos[tituloId];
    if (!titulo) {
      throw Object.assign(
        new Error(`El título "${tituloId}" no existe.`),
        { status: 404, code: 'TITULO_NO_EXISTE' }
      );
    }

    const subparametros = Array.isArray(titulo.subparametros) ? titulo.subparametros : [];

    for (const sp of subparametros) {
      if (mismoDisplay(sp.displayName, displayName)) {
        throw Object.assign(
          new Error(`El subparámetro "${sp.displayName}" ya existe en "${titulo.displayName}".`),
          { status: 409, code: 'DISPLAYNAME_DUPLICADO' }
        );
      }
    }

    if (subparametros.some(sp => sp.id === id)) {
      throw Object.assign(
        new Error(`El id "${id}" ya existe entre los subparámetros de "${titulo.displayName}".`),
        { status: 409, code: 'ID_DUPLICADO' }
      );
    }

    subparametros.push({
      id,
      displayName,
      label,
      unidadesOverride,
    });

    titulo.subparametros = subparametros;
    titulos[tituloId] = titulo;

    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { tituloId, id, displayName, label, unidadesOverride };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al crear subparámetro:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// CREAR UNIDAD
// ============================================================

async function crearUnidad(body) {
  const magnitud = String(body?.magnitud || '').trim();
  const simbolo  = String(body?.simbolo || '').trim();
  const nombre   = String(body?.nombre || '').trim();
  const factor   = body?.factor != null ? String(body.factor).trim() : '10^0 (Base)';
  const prefijo  = body?.prefijo != null ? String(body.prefijo).trim() : 'Base';

  if (!magnitud) throw Object.assign(new Error('magnitud es obligatoria.'), { status: 400 });
  if (!simbolo)  throw Object.assign(new Error('simbolo es obligatorio.'), { status: 400 });
  if (!nombre)   throw Object.assign(new Error('nombre es obligatorio.'), { status: 400 });
  if (simbolo.length > 20) throw Object.assign(new Error('simbolo no puede exceder 20 caracteres.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');

    const grupo = unidades[magnitud];
    if (!grupo) {
      throw Object.assign(
        new Error(`La magnitud "${magnitud}" no existe en el catálogo.`),
        { status: 404, code: 'MAGNITUD_INEXISTENTE' }
      );
    }

    const lista = Array.isArray(grupo.unidades) ? grupo.unidades : [];

    if (lista.some(u => String(u.simbolo).toLowerCase() === simbolo.toLowerCase())) {
      throw Object.assign(
        new Error(`Ya existe la unidad "${simbolo}" en la magnitud "${magnitud}".`),
        { status: 409, code: 'SIMBOLO_DUPLICADO' }
      );
    }

    lista.push({ simbolo, nombre, factor, prefijo });
    grupo.unidades = lista;
    unidades[magnitud] = grupo;

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { magnitud, simbolo, nombre, factor, prefijo };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al crear unidad:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// CREAR MAGNITUD
// ============================================================

async function crearMagnitud(body) {
  const id     = slugify(body?.id || body?.nombre || '');
  const nombre = String(body?.nombre || '').trim();
  const unidadesIniciales = Array.isArray(body?.unidadesIniciales) ? body.unidadesIniciales : [];

  if (!id)     throw Object.assign(new Error('id es obligatorio.'), { status: 400 });
  if (!nombre) throw Object.assign(new Error('nombre es obligatorio.'), { status: 400 });
  if (id === '*') {
    throw Object.assign(new Error('El id "*" está reservado para el comodín "Other".'), { status: 400 });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');

    if (unidades[id]) {
      throw Object.assign(
        new Error(`La magnitud "${id}" ya existe.`),
        { status: 409, code: 'ID_DUPLICADO' }
      );
    }

    const lista = [];
    const seen = new Set();
    for (const [idx, u] of unidadesIniciales.entries()) {
      const simbolo = String(u?.simbolo || '').trim();
      const nom     = String(u?.nombre || '').trim();
      if (!simbolo || !nom) {
        throw Object.assign(
          new Error(`unidadesIniciales[${idx}] requiere simbolo y nombre.`),
          { status: 400 }
        );
      }
      if (seen.has(simbolo.toLowerCase())) {
        throw Object.assign(
          new Error(`Símbolo duplicado en unidadesIniciales: "${simbolo}".`),
          { status: 400 }
        );
      }
      seen.add(simbolo.toLowerCase());
      lista.push({
        simbolo,
        nombre: nom,
        factor:  u?.factor  != null ? String(u.factor).trim()  : '10^0 (Base)',
        prefijo: u?.prefijo != null ? String(u.prefijo).trim() : 'Base',
      });
    }

    unidades[id] = { nombre, unidades: lista };

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { id, nombre, unidades: lista };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al crear magnitud:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ACTUALIZAR TÍTULO
// ============================================================

async function actualizarTitulo(tituloId, body) {
  const id = String(tituloId || '').trim();
  if (!id) throw Object.assign(new Error('id es obligatorio.'), { status: 400 });

  const labelRaw    = body?.label;
  const magnitudRaw = body?.magnitud;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    const titulo = titulos[id];
    if (!titulo) {
      throw Object.assign(
        new Error(`El título "${id}" no existe.`),
        { status: 404, code: 'TITULO_NO_EXISTE' }
      );
    }

    if (labelRaw !== undefined) {
      titulo.label = labelRaw != null ? String(labelRaw).trim() : '';
    }

    if (magnitudRaw !== undefined) {
      const magnitud = String(magnitudRaw).trim();
      if (!magnitud) {
        throw Object.assign(new Error('magnitud no puede ser vacía.'), { status: 400 });
      }
      if (magnitud !== '*') {
        const unidadesRaw = (await conn.query(
          "SELECT data FROM catalog_units_titles WHERE id = 'unidades';"
        ))[0].data;
        const unidades = typeof unidadesRaw === 'string' ? JSON.parse(unidadesRaw) : unidadesRaw;
        if (!unidades[magnitud]) {
          throw Object.assign(
            new Error(`La magnitud "${magnitud}" no existe en el catálogo.`),
            { status: 400, code: 'MAGNITUD_INEXISTENTE' }
          );
        }
      }
      titulo.magnitud = magnitud;
    }

    titulos[id] = titulo;
    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { id, ...titulo };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al actualizar título:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ELIMINAR TÍTULO
// ============================================================

async function eliminarTitulo(tituloId) {
  const id = String(tituloId || '').trim();
  if (!id) throw Object.assign(new Error('id es obligatorio.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    if (!titulos[id]) {
      throw Object.assign(
        new Error(`El título "${id}" no existe.`),
        { status: 404, code: 'TITULO_NO_EXISTE' }
      );
    }

    delete titulos[id];

    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { id, eliminado: true };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al eliminar título:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ACTUALIZAR SUBPARÁMETRO
// ============================================================

async function actualizarSubparametro(tituloId, subId, body) {
  const tid = String(tituloId || '').trim();
  const sid = String(subId || '').trim();
  if (!tid) throw Object.assign(new Error('tituloId es obligatorio.'), { status: 400 });
  if (!sid) throw Object.assign(new Error('subId es obligatorio.'), { status: 400 });

  const labelRaw    = body?.label;
  const overrideRaw = body?.unidadesOverride;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    const titulo = titulos[tid];
    if (!titulo) {
      throw Object.assign(
        new Error(`El título "${tid}" no existe.`),
        { status: 404, code: 'TITULO_NO_EXISTE' }
      );
    }

    const subs = Array.isArray(titulo.subparametros) ? titulo.subparametros : [];
    const idx = subs.findIndex(s => s.id === sid);
    if (idx === -1) {
      throw Object.assign(
        new Error(`El subparámetro "${sid}" no existe en "${titulo.displayName}".`),
        { status: 404, code: 'SUBPARAMETRO_NO_EXISTE' }
      );
    }

    const sp = subs[idx];

    if (labelRaw !== undefined) {
      sp.label = labelRaw != null ? String(labelRaw).trim() : '';
    }

    if (overrideRaw !== undefined) {
      if (Array.isArray(overrideRaw) && overrideRaw.length > 0) {
        sp.unidadesOverride = overrideRaw.map(u => String(u).trim()).filter(Boolean);
      } else {
        sp.unidadesOverride = null;
      }
    }

    subs[idx] = sp;
    titulo.subparametros = subs;
    titulos[tid] = titulo;

    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { tituloId: tid, ...sp };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al actualizar subparámetro:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ELIMINAR SUBPARÁMETRO
// ============================================================

async function eliminarSubparametro(tituloId, subId) {
  const tid = String(tituloId || '').trim();
  const sid = String(subId || '').trim();
  if (!tid) throw Object.assign(new Error('tituloId es obligatorio.'), { status: 400 });
  if (!sid) throw Object.assign(new Error('subId es obligatorio.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: titulos } = await leerFilaParaActualizar(conn, 'titulos');

    const titulo = titulos[tid];
    if (!titulo) {
      throw Object.assign(
        new Error(`El título "${tid}" no existe.`),
        { status: 404, code: 'TITULO_NO_EXISTE' }
      );
    }

    const subs = Array.isArray(titulo.subparametros) ? titulo.subparametros : [];
    const nuevas = subs.filter(s => s.id !== sid);
    if (nuevas.length === subs.length) {
      throw Object.assign(
        new Error(`El subparámetro "${sid}" no existe en "${titulo.displayName}".`),
        { status: 404, code: 'SUBPARAMETRO_NO_EXISTE' }
      );
    }

    titulo.subparametros = nuevas;
    titulos[tid] = titulo;

    await escribirFila(conn, 'titulos', titulos);
    await conn.commit();

    return { tituloId: tid, subId: sid, eliminado: true };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al eliminar subparámetro:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ACTUALIZAR MAGNITUD
// ============================================================

async function actualizarMagnitud(magnitudId, body) {
  const id = String(magnitudId || '').trim();
  if (!id) throw Object.assign(new Error('id es obligatorio.'), { status: 400 });

  const nombreRaw = body?.nombre;
  if (nombreRaw === undefined) {
    throw Object.assign(new Error('nombre es obligatorio para actualizar.'), { status: 400 });
  }
  const nombre = String(nombreRaw).trim();
  if (!nombre) throw Object.assign(new Error('nombre no puede ser vacío.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');

    const grupo = unidades[id];
    if (!grupo) {
      throw Object.assign(
        new Error(`La magnitud "${id}" no existe.`),
        { status: 404, code: 'MAGNITUD_INEXISTENTE' }
      );
    }

    grupo.nombre = nombre;
    unidades[id] = grupo;

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { id, ...grupo };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al actualizar magnitud:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ELIMINAR MAGNITUD
// ============================================================

async function eliminarMagnitud(magnitudId) {
  const id = String(magnitudId || '').trim();
  if (!id) throw Object.assign(new Error('id es obligatorio.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');
    if (!unidades[id]) {
      throw Object.assign(
        new Error(`La magnitud "${id}" no existe.`),
        { status: 404, code: 'MAGNITUD_INEXISTENTE' }
      );
    }

    const titulosRaw = (await conn.query(
      "SELECT data FROM catalog_units_titles WHERE id = 'titulos';"
    ))[0].data;
    const titulos = typeof titulosRaw === 'string' ? JSON.parse(titulosRaw) : titulosRaw;

    const referenciadaPor = Object.entries(titulos)
      .filter(([, t]) => t.magnitud === id)
      .map(([tid]) => tid);

    if (referenciadaPor.length > 0) {
      throw Object.assign(
        new Error(
          `No se puede eliminar la magnitud "${id}": los títulos [${referenciadaPor.join(', ')}] la referencian.`
        ),
        { status: 409, code: 'MAGNITUD_EN_USO' }
      );
    }

    delete unidades[id];

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { id, eliminado: true };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al eliminar magnitud:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ACTUALIZAR UNIDAD
// ============================================================

async function actualizarUnidad(magnitudId, simbolo, body) {
  const id  = String(magnitudId || '').trim();
  const sym = String(simbolo || '').trim();
  if (!id)  throw Object.assign(new Error('magnitudId es obligatorio.'), { status: 400 });
  if (!sym) throw Object.assign(new Error('simbolo es obligatorio.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');

    const grupo = unidades[id];
    if (!grupo) {
      throw Object.assign(
        new Error(`La magnitud "${id}" no existe.`),
        { status: 404, code: 'MAGNITUD_INEXISTENTE' }
      );
    }

    const lista = Array.isArray(grupo.unidades) ? grupo.unidades : [];
    const idx = lista.findIndex(u => String(u.simbolo).toLowerCase() === sym.toLowerCase());
    if (idx === -1) {
      throw Object.assign(
        new Error(`La unidad "${sym}" no existe en la magnitud "${id}".`),
        { status: 404, code: 'UNIDAD_NO_EXISTE' }
      );
    }

    const u = lista[idx];

    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) throw Object.assign(new Error('nombre no puede ser vacío.'), { status: 400 });
      u.nombre = nombre;
    }
    if (body?.factor !== undefined) {
      u.factor = body.factor != null ? String(body.factor).trim() : '';
    }
    if (body?.prefijo !== undefined) {
      u.prefijo = body.prefijo != null ? String(body.prefijo).trim() : '';
    }

    lista[idx] = u;
    grupo.unidades = lista;
    unidades[id] = grupo;

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { magnitud: id, ...u };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al actualizar unidad:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// ELIMINAR UNIDAD
// ============================================================

async function eliminarUnidad(magnitudId, simbolo) {
  const id  = String(magnitudId || '').trim();
  const sym = String(simbolo || '').trim();
  if (!id)  throw Object.assign(new Error('magnitudId es obligatorio.'), { status: 400 });
  if (!sym) throw Object.assign(new Error('simbolo es obligatorio.'), { status: 400 });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { data: unidades } = await leerFilaParaActualizar(conn, 'unidades');

    const grupo = unidades[id];
    if (!grupo) {
      throw Object.assign(
        new Error(`La magnitud "${id}" no existe.`),
        { status: 404, code: 'MAGNITUD_INEXISTENTE' }
      );
    }

    const lista = Array.isArray(grupo.unidades) ? grupo.unidades : [];
    const nuevas = lista.filter(u => String(u.simbolo).toLowerCase() !== sym.toLowerCase());
    if (nuevas.length === lista.length) {
      throw Object.assign(
        new Error(`La unidad "${sym}" no existe en la magnitud "${id}".`),
        { status: 404, code: 'UNIDAD_NO_EXISTE' }
      );
    }

    grupo.unidades = nuevas;
    unidades[id] = grupo;

    await escribirFila(conn, 'unidades', unidades);
    await conn.commit();

    return { magnitud: id, simbolo: sym, eliminado: true };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al eliminar unidad:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  query: (text, params) => pool.query(text, params),

  // Lectura
  obtenerCatalogo,
  obtenerTitulos,
  obtenerUnidades,

  // Creación
  crearTitulo,
  crearSubparametro,
  crearUnidad,
  crearMagnitud,
 
  // Actualización
  actualizarTitulo,
  actualizarSubparametro,
  actualizarMagnitud,
  actualizarUnidad,

  // Eliminación
  eliminarTitulo,
  eliminarSubparametro,
  eliminarMagnitud,
  eliminarUnidad,
};