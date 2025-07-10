const TronWeb = require('tronweb');
const { DataSource } = require("typeorm");
const walletEntity = require("./src/domain/wallet");
const { encrypt, decrypt } = require('./src/infra/cryptoUtils');
require("dotenv").config();

const tronWeb = new TronWeb.TronWeb({
  fullHost: process.env.TRON_NODE_URL,
  privateKey: process.env.TRON_PRIVATE_KEY,
});

// Инициализация БД
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: [walletEntity],
});

async function createPlatformWallet() {
  await AppDataSource.initialize();
  const walletRepo = AppDataSource.getRepository("Wallet");

  const existing = await walletRepo.findOneBy({ traderId: "platform", currency: "USDT" });
  if (existing) {
    console.log("❗️Platform wallet already exists:");
    console.log(existing);
    return;
  }

  const account = await tronWeb.createAccount();
  const newWallet = walletRepo.create({
    traderId: "platform",
    currency: "USDT",
    address: account.address.base58,
    balance: 0,
    frozen: 0,
    privateKey: account.privateKey
  });

  await walletRepo.save(newWallet);

  console.log("✅ Platform custody wallet created:");
  console.log({
    address: account.address.base58,
    privateKey: account.privateKey
  });
}

createPlatformWallet().catch(console.error);
