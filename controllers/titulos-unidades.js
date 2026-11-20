async function actualizarTitulo(tituloId, body) {
  const id = String(tituloId || '').trim();
  if (!id) throw Object.assign(new Error('id es obligatorio.'), { status: 400 });

  const displayNameRaw = body?.displayName;
  const labelRaw       = body?.label;
  const magnitudRaw    = body?.magnitud;
  const migrarCertificados = body?.migrarCertificados === true;

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

    const oldDisplayName = titulo.displayName;
    let newDisplayName = oldDisplayName;

    // ── displayName ──
    if (displayNameRaw !== undefined) {
      const displayName = String(displayNameRaw).trim();
      if (!displayName) {
        throw Object.assign(new Error('displayName no puede ser vacío.'), { status: 400 });
      }
      if (displayName.length < 3 || displayName.length > 150) {
        throw Object.assign(new Error('displayName debe tener entre 3 y 150 caracteres.'), { status: 400 });
      }

      if (mismoDisplay(displayName, oldDisplayName)) {
        // Es el mismo (solo cambió mayúsculas/acentos/espacios) → no-op
        newDisplayName = oldDisplayName;
      } else {
        // Validar unicidad contra otros títulos
        for (const [existingId, t] of Object.entries(titulos)) {
          if (existingId === id) continue;
          if (mismoDisplay(t.displayName, displayName)) {
            throw Object.assign(
              new Error(`Ya existe otro título con displayName "${t.displayName}" (id: ${existingId}).`),
              { status: 409, code: 'DISPLAYNAME_DUPLICADO' }
            );
          }
        }
        newDisplayName = displayName;
        titulo.displayName = displayName;
      }
    }

    // ── label ──
    if (labelRaw !== undefined) {
      titulo.label = labelRaw != null ? String(labelRaw).trim() : '';
    }

    // ── magnitud ──
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

    // ── Migración opcional de certificados ──
    let certificadosMigrados = 0;
    if (
      migrarCertificados &&
      newDisplayName !== oldDisplayName
    ) {
      certificadosMigrados = await migrarTituloEnCertificados(
        conn,
        oldDisplayName,
        newDisplayName
      );
    }

    await conn.commit();

    return {
      id,
      ...titulo,
      _meta: {
        displayNameAnterior: oldDisplayName,
        displayNameNuevo:    newDisplayName,
        certificadosMigrados,
      },
    };
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch { /* noop */ }
    console.error('Error al actualizar título:', err);
    throw err.status ? err : wrapError(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Migra `ResultTable.title` (y opcionalmente su `parameter`, que no cambia aquí)
 * en todos los certificados que referencien el displayName viejo.
 */
async function migrarTituloEnCertificados(conn, oldDisplayName, newDisplayName) {
  // Ajusta el nombre de la tabla y columna según tu esquema real.
  // Aquí asumo: tabla `certificados`, columna JSON `data`, y dentro `data['Result Tables']`.
  const rows = await conn.query(
    "SELECT id, data FROM certificados;"
  );

  let migrados = 0;

  for (const row of rows) {
    const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (!raw || typeof raw !== 'object') continue;

    const tables = raw['Result Tables'];
    if (!Array.isArray(tables)) continue;

    let touched = false;
    for (const t of tables) {
      if (t && t.title === oldDisplayName) {
        t.title = newDisplayName;
        touched = true;
      }
    }

    if (touched) {
      await conn.query(
        `UPDATE certificados SET data = ?, updated_at = ${NOW_MEXICO} WHERE id = ?;`,
        [JSON.stringify(raw), row.id]
      );
      migrados++;
    }
  }

  return migrados;
}
