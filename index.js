const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/routes');

const app = express();

app.use(cors()); // Habilitar CORS
app.use(express.json({ limit: '10mb' })); // Límite de 10mb para recibir imágenes en Base64

// Montar todas las rutas bajo el prefijo /api
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});