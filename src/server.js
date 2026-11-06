import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validarConfig } from './config.js';

validarConfig();

const { conectarMongo } = await import('./db/mongo.js');
const { conectarRedis } = await import('./db/redis.js');
const { publico } = await import('./routes/publico.js');
const { admin } = await import('./routes/admin.js');

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(raiz));
app.use('/api/admin', admin);
app.use('/api', publico);

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

try {
  await conectarMongo();
  console.log('[mongodb] conectado');
} catch (e) {
  console.error(`[mongodb] falha na conexão: ${e.message}`);
  console.error('Confira MONGODB_URI e se o seu IP está liberado no Atlas (Network Access).');
  process.exit(1);
}
await conectarRedis();

app.listen(config.porta, () => {
  console.log(`Loja:  http://localhost:${config.porta}`);
  console.log(`Admin: http://localhost:${config.porta}/admin.html`);
});
