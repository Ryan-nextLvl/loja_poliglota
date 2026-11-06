// Popula o MongoDB com produtos de exemplo (só se a coleção estiver vazia).
import { config, validarConfig } from '../src/config.js';
import { MongoClient } from 'mongodb';

validarConfig();

const exemplos = [
  { nome: 'Fone Bluetooth Pulse', categoria: 'Áudio', preco: 149.9, estoque: 25, descricao: 'Fone sem fio com cancelamento de ruído e 30 h de bateria.', atributos: { Cor: 'Preto', Bateria: '30 h', Conexão: 'Bluetooth 5.3' } },
  { nome: 'Caixa de Som Mini Beat', categoria: 'Áudio', preco: 89.9, estoque: 40, descricao: 'Caixa portátil resistente à água, ideal para praia e piscina.', atributos: { Potência: '10 W', Resistência: 'IPX7' } },
  { nome: 'Carregador Turbo 33W', categoria: 'Acessórios', preco: 59.9, estoque: 60, descricao: 'Carregador de parede USB-C com carga rápida.', atributos: { Potência: '33 W', Porta: 'USB-C' } },
  { nome: 'Cabo USB-C Reforçado 1,5 m', categoria: 'Acessórios', preco: 24.9, estoque: 120, descricao: 'Cabo trançado para carga e dados.', atributos: { Comprimento: '1,5 m' } },
  { nome: 'Mouse Sem Fio Ergo', categoria: 'Periféricos', preco: 79.9, estoque: 18, descricao: 'Mouse ergonômico silencioso com receptor USB.', atributos: { DPI: '1600', Cor: 'Cinza' } },
  { nome: 'Teclado Compacto ABNT2', categoria: 'Periféricos', preco: 129.9, estoque: 12, descricao: 'Teclado 65% com layout ABNT2 e teclas silenciosas.', atributos: { Layout: 'ABNT2', Conexão: 'USB' } },
  { nome: 'Suporte para Notebook', categoria: 'Acessórios', preco: 69.9, estoque: 0, descricao: 'Suporte de alumínio dobrável com 6 níveis de altura.', atributos: { Material: 'Alumínio' } },
  { nome: 'Webcam Full HD', categoria: 'Periféricos', preco: 119.9, estoque: 9, descricao: 'Webcam 1080p com microfone embutido.', atributos: { Resolução: '1920x1080', Microfone: 'Sim' } },
];

const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const col = client.db(config.mongoDb).collection('produtos');
  if (await col.estimatedDocumentCount()) {
    console.log('A coleção "produtos" já tem dados. Nada a fazer.');
  } else {
    const agora = new Date();
    await col.insertMany(exemplos.map((p, i) => ({ ...p, imagem: '', ativo: true, criadoEm: new Date(agora - i * 1000), atualizadoEm: agora })));
    console.log(`${exemplos.length} produtos inseridos em ${config.mongoDb}.produtos`);
  }
} finally {
  await client.close();
}
