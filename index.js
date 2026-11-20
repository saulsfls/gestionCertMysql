const express = require('express');
const cors = require('cors');
const apiCertRoutes = require('./routes/routes.cert.js');
const apiCmcRoutes = require('./routes/routes.cmc.js');
const apiIncRoutes = require('./routes/routes.inc.js');
const apiCatalogo = require('./routes/routes.catalog.js');

const app = express();

app.use(cors()); // Habilitar CORS
app.use(express.json({ limit: '10mb' })); // Límite de 10mb para recibir imágenes en Base64

//Rutas de la gestion de certificados
app.use('/api', apiCertRoutes);

//Rutas de la gestion de titulos y unidades del los certificados
app.use('/api/catalogo/',apiCatalogo);

//Rutas del CMC se monta con el prefijo api/cmc-data
app.use('/api/cmc-data', apiCmcRoutes);

//Rutas para la incertidumbre
app.use('/api/inc-data', apiIncRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});