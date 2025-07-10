const { DataSource } = require("typeorm");
const walletEntity = require("./src/domain/wallet");
const TronWeb = require('tronweb');
const dotenv = require("dotenv");
dotenv.config();

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

const isValidBase58Address = (address) => {
  return typeof address === 'string' &&
    /^T[1-9A-HJ-NP-Za-km-z]{33,34}$/.test(address) &&
    TronWeb.TronWeb.isAddress(address);
};

(async () => {
  try {
    await AppDataSource.initialize();
    const walletRepo = AppDataSource.getRepository("Wallet");

    const wallets = await walletRepo.find();
    console.log(`🔍 Проверяем ${wallets.length} адресов...`);

    for (const wallet of wallets) {
      const addr = wallet.address?.trim();

      if (!addr || !isValidBase58Address(addr)) {
        console.warn(`⛔ Invalid address found: ${addr} (wallet ID: ${wallet.id}, traderId: ${wallet.traderId})`);
      }
    }

    console.log("✅ Проверка завершена.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Ошибка при проверке адресов:", err);
    process.exit(1);
  }
})();
