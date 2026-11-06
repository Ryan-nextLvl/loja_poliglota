import { MongoClient, ObjectId } from 'mongodb';
import { config } from '../config.js';

let client;
let db;

export async function conectarMongo() {
  client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(config.mongoDb);
  await db.collection('produtos').createIndex({ ativo: 1, criadoEm: -1 });
  await db.collection('produtos').createIndex({ categoria: 1 });
  return db;
}

export const produtos = () => db.collection('produtos');
export const pingMongo = () => db.command({ ping: 1 });

export function idValido(id) {
  return typeof id === 'string' && ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}
export const oid = (id) => new ObjectId(id);

// Documento do Mongo -> objeto enviado ao front-end.
export function serializar(doc) {
  const { _id, ...resto } = doc;
  return { id: String(_id), ...resto };
}
