const express = require("express");
const { DataSource } = require("typeorm");
const dotenv = require("dotenv");
dotenv.config();

const TronWeb = require('tronweb');
const tronWeb = new TronWeb.TronWeb({
  fullHost: process.env.TRON_NODE_URL,
  privateKey: process.env.TRON_PRIVATE_KEY
});

const walletEntity = require("./src/domain/wallet");
const transactionEntity = require("./src/domain/wallet_transaction");
const indexEntity = require("./src/domain/trader_wallet_index");
const TronWallet = require("./src/infra/tronWallet");
const Trc20Service = require("./src/infra/trc20Service");
const TronWebhooks = require("./src/infra/tronWebhooks.js");

const app = express();
app.use(express.json());

// Добавьте в index.js перед инициализацией TypeORM
console.log('Connecting to Tron node:', process.env.TRON_NODE_URL);

// Инициализация TypeORM
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: true,
  entities: [walletEntity, transactionEntity, indexEntity],
});

AppDataSource.initialize().then(() => {
  console.log("DB connected");

  const walletRepo = AppDataSource.getRepository("Wallet");
  const indexRepo = AppDataSource.getRepository("TraderWalletIndex");
  const txRepo = AppDataSource.getRepository("WalletTransaction");

  // Инициализация вебхуков
  // const tronWebhooks = new TronWebhooks(tronWeb); // Передаем экземпляр tronWeb

  // Генерация TRON-кошелька для трейдера
  app.post("/wallets/create", async (req, res) => {
    const { traderId } = req.body;

    try {
      let index = await indexRepo.findOneBy({ traderId });
      if (!index) {
        index = indexRepo.create({ traderId, hdIndex: 0 });
        await indexRepo.save(index);
      }

      // Генерируем новый адрес
      const { address, privateKey } = await TronWallet.generateAddress();

      // Сохраняем кошелек
      const wallet = walletRepo.create({
        traderId,
        currency: "USDT",
        address,
        balance: 0,
        frozen: 0,
        privateKey // В реальном проекте храните зашифрованным
      });
      await walletRepo.save(wallet);

      // // Обновляем индекс
      index.hdIndex += 1;
      await indexRepo.save(index);

      // Подписываемся на события для этого адреса
      try {
        await tronWebhooks.subscribeToAddress(address);
      } catch (error) {
        console.warn('Failed to subscribe to events. Using fallback polling method');
        // Дополнительные действия не нужны - polling запустится автоматически
      }

      return res.json({ address });
    } catch (error) {
      console.error("Error creating wallet:", error);
      return res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  // Подтверждение депозита (on-chain)
  app.post("/wallets/deposit", async (req, res) => {
    const { traderId, amount, txHash } = req.body;
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      wallet.balance += amount;
      await walletRepo.save(wallet);
      console.log(`deposit: ${amount}. Wallet balance: ${wallet.balance}`)

      const tx = txRepo.create({
        traderId,
        currency: "USDT",
        type: "deposit",
        amount,
        txHash,
        status: "confirmed",
      });
      await txRepo.save(tx);

      return res.json({ success: true });
    } catch (error) {
      console.error("Error processing deposit:", error);
      return res.status(500).json({ error: "Failed to process deposit" });
    }
  });

  // Заморозка средств под заказ
  app.post("/wallets/freeze", async (req, res) => {
    const { traderId, amount, orderId } = req.body;

    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet || wallet.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      wallet.balance -= amount;
      wallet.frozen += amount;
      await walletRepo.save(wallet);

      const tx = txRepo.create({
        traderId,
        currency: "USDT",
        type: "freeze",
        amount,
        orderId,
        status: "pending",
      });
      await txRepo.save(tx);

      return res.json({ frozen: amount });
    } catch (error) {
      console.error("Error freezing funds:", error);
      return res.status(500).json({ error: "Failed to freeze funds" });
    }
  });

  // Разморозка и перевод средств (off-chain)
  app.post("/wallets/release", async (req, res) => {
    const { traderId, orderId, rewardPercent = 0.01 } = req.body;

    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      const freezeTx = await txRepo.findOneBy({ orderId, type: "freeze" });
      if (!freezeTx) return res.status(404).json({ error: "No frozen transaction found" });

      const amount = freezeTx.amount;
      const reward = parseFloat((amount * rewardPercent).toFixed(6));

      wallet.frozen -= amount;
      if (wallet.frozen < 0) wallet.frozen = 0
      wallet.balance += reward;
      await walletRepo.save(wallet);

      await txRepo.save(
        txRepo.create({
          traderId,
          currency: "USDT",
          type: "release",
          amount,
          orderId,
          status: "confirmed",
        })
      );

      await txRepo.save(
        txRepo.create({
          traderId,
          currency: "USDT",
          type: "reward",
          amount: reward,
          status: "confirmed",
        })
      );

      return res.json({ released: amount, reward });
    } catch (error) {
      console.error("Error releasing funds:", error);
      return res.status(500).json({ error: "Failed to release funds" });
    }
  });

  // Вывод USDT (on-chain)
  app.post("/wallets/withdraw", async (req, res) => {
    const { traderId, toAddress, amount } = req.body;
  
    if (!traderId || !toAddress || !amount) {
      return res.status(400).json({ error: "Missing parameters" });
    }
  
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
  
      // Проверяем баланс (off-chain)
      if (wallet.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
  
      // Отправляем транзакцию в блокчейн
      const txHash = await Trc20Service.transfer(
        wallet.address,
        toAddress,
        amount,
        wallet.privateKey
      );
  
      // Обновляем баланс
      wallet.balance -= amount;
      await walletRepo.save(wallet);
  
      // Сохраняем транзакцию
      await txRepo.save(
        txRepo.create({
          traderId,
          currency: "USDT",
          type: "withdraw",
          amount,
          txHash,
          status: "pending",
        })
      );
  
      return res.json({ txHash });
    } catch (error) {
      console.error("Withdraw error:", error);
      return res.status(500).json({ 
        error: "Withdraw failed",
        details: error.message || error.toString() 
      });
    }
  });

  // История операций
  app.get("/wallets/:traderId/history", async (req, res) => {
    const { traderId } = req.params;
  
    try {
      const transactions = await txRepo.find({
        where: { traderId },
        order: { createdAt: "DESC" },
      });
  
      res.json({ history: transactions });
    } catch (error) {
      console.error("Error fetching history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Баланс (off-chain)
  app.get("/wallets/:traderId/balance", async (req, res) => {
    const { traderId } = req.params;
  
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });
  
      res.json({
        traderId: wallet.traderId,
        currency: wallet.currency,
        balance: wallet.balance,
        frozen: wallet.frozen,
        address: wallet.address,
      });
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Получение on-chain баланса
  app.get("/wallets/:traderId/onchain-balance", async (req, res) => {
    const { traderId } = req.params;
    
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });
  
      const balance = await Trc20Service.getBalance(wallet.address);
      res.json({ balance });
    } catch (error) {
      console.error("Error fetching on-chain balance:", error);
      
      // Попробуем альтернативный метод
      try {
        const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });
        
        const balance = await Trc20Service.getBalanceViaEvents(wallet.address);
        res.json({ balance });
      } catch (fallbackError) {
        res.status(500).json({ 
          error: "Failed to fetch on-chain balance",
          details: {
            primary: error.message,
            fallback: fallbackError.message
          }
        });
      }
    }
  });

  // Получение адреса кошелька
  app.get("/wallets/:traderId/address", async (req, res) => {
    const { traderId } = req.params;
  
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
  
      res.json({ address: wallet.address });
    } catch (error) {
      console.error("Error fetching address:", error);
      res.status(500).json({ error: "Failed to fetch address" });
    }
  });

  // Запуск сервера
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`USDT-TRC20 Wallet service running on port ${PORT}`);
    console.log(`Tron network: ${process.env.TRON_NODE_URL}`);
  });
}).catch(error => {
  console.error("Database connection failed:", error);
});