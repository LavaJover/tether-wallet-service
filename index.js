const express = require("express");
const { DataSource } = require("typeorm");
const dotenv = require("dotenv");
const { topUpIfNeeded } = require('./src/infra/trxTopUpService');
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
const withdrawalRuleEntity = require("./src/domain/withdrawal_rule.js");
const { Not } = require("typeorm");


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
  entities: [walletEntity, transactionEntity, indexEntity, withdrawalRuleEntity],
});

AppDataSource.initialize().then(() => {
  console.log("DB connected");

  const walletRepo = AppDataSource.getRepository("Wallet");
  const indexRepo = AppDataSource.getRepository("TraderWalletIndex");
  const txRepo = AppDataSource.getRepository("WalletTransaction");
  const ruleRepo = AppDataSource.getRepository("WithdrawalRule");

  // Инициализация вебхуков
  //  const tronWebhooks = new TronWebhooks(tronWeb); // Передаем экземпляр tronWeb

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

  app.post("/wallets/offchain-withdraw", async (req, res) => {
    const { traderId, amount, txHash } = req.body;
    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      wallet.balance -= amount;
      await walletRepo.save(wallet);
      console.log(`off-chain withdraw: ${amount}. Wallet balance: ${wallet.balance}`)

      const tx = txRepo.create({
        traderId,
        currency: "USDT",
        type: "off-chain withdraw",
        amount,
        txHash,
        status: "confirmed",
      });
      await txRepo.save(tx);

      return res.json({ success: true });
    } catch (error) {
      console.error("Error processing off-chain withdraw:", error);
      return res.status(500).json({ error: "Failed to process off-chain withdraw" });
    }
  });

  // Заморозка средств под заказ
  app.post("/wallets/freeze", async (req, res) => {
    const { traderId, amount, orderId } = req.body;

    try {
      const wallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      // if (!wallet || wallet.balance < amount) {
      //   return res.status(400).json({ error: "Insufficient balance" });
      // }

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
    const { 
      traderId, 
      orderId, 
      rewardPercent = 0.01, 
      platformFee = 0.02, 
      merchantId,
      commissionUsers = [] 
    } = req.body;
  
    try {
      // Трейдерский кошелёк
      const traderWallet = await walletRepo.findOneBy({ traderId, currency: "USDT" });
      if (!traderWallet) return res.status(404).json({ error: "Trader wallet not found" });
  
      // Замороженная транзакция
      const freezeTx = await txRepo.findOne({
        where: { orderId, type: "freeze" },
        order: { createdAt: "DESC" }, 
      });      
      if (!freezeTx) return res.status(404).json({ error: "Freeze transaction not found" });
  
      const amount = freezeTx.amount;
      
      // Валидация входных данных
      if (commissionUsers.some(u => u.commission < 0 || u.commission > 1)) {
        return res.status(400).json({ error: "Invalid commission value" });
      }
      
      // Расчет всех сумм
      const platformCut = parseFloat((amount * platformFee).toFixed(6));          // Полный процент платформы
      const merchantAmount = parseFloat((amount - platformCut).toFixed(6));       // Мерчант получает оставшуюся часть
      
      const reward = parseFloat((amount * rewardPercent).toFixed(6));             // Вознаграждение трейдера
      
      // Комиссии тим-лидов
      let totalTeamCommissions = 0;
      let teamCommissions = [];
      
      // Защита: проверяем, не превышают ли комиссии платформенный сбор
      if (platformCut > 0) {
        for (const user of commissionUsers) {
          const commissionAmount = parseFloat((amount * user.commission).toFixed(6));
          
          // Проверяем, не превышает ли комиссия доступный остаток
          if (commissionAmount <= platformCut) {
            totalTeamCommissions += commissionAmount;
            teamCommissions.push({
              userId: user.userId,
              amount: commissionAmount
            });
          } else {
            console.warn(`Commission for user ${user.userId} exceeds platform cut: ${commissionAmount} > ${platformCut}`);
          }
        }
      } else {
        console.warn("Platform cut is zero, skipping team commissions");
      }
      
      // Чистая прибыль платформы
      const platformProfit = parseFloat((
        platformCut - reward - totalTeamCommissions
      ).toFixed(6));
      
      // Проверка корректности расчетов
      if (platformProfit < 0) {
        // Корректируем прибыль платформы и сбрасываем комиссии
        platformProfit = parseFloat((platformCut - reward).toFixed(6));
        totalTeamCommissions = 0;
        teamCommissions = [];
        
        console.warn("Team commissions exceed available platform funds. Skipping team payouts.");
      }
  
      // Обновление баланса трейдера
      traderWallet.frozen -= amount;
      if (traderWallet.frozen < 0) traderWallet.frozen = 0;
      traderWallet.balance += reward;
      await walletRepo.save(traderWallet);
  
      // Логирование операций трейдера
      await txRepo.save(txRepo.create({
        traderId,
        currency: "USDT",
        type: "release",
        amount: -amount,
        orderId,
        status: "confirmed",
      }));
  
      await txRepo.save(txRepo.create({
        traderId,
        currency: "USDT",
        type: "reward",
        amount: reward,
        status: "confirmed",
      }));
  
      // Начисление комиссий тим-лидам (только если прошли проверки)
      for (const commission of teamCommissions) {
        const teamLeadWallet = await walletRepo.findOneBy({ 
          traderId: commission.userId, 
          currency: "USDT" 
        });
        
        if (!teamLeadWallet) {
          console.error(`Team lead wallet not found: ${commission.userId}`);
          continue; // Пропускаем, но не прерываем процесс
        }
  
        teamLeadWallet.balance += commission.amount;
        await walletRepo.save(teamLeadWallet);
  
        await txRepo.save(txRepo.create({
          traderId: commission.userId,
          currency: "USDT",
          type: "team_lead_commission",
          amount: commission.amount,
          orderId,
          status: "confirmed",
        }));
      }
  
      // Начисление мерчанту
      const merchantWallet = await walletRepo.findOneBy({ traderId: merchantId, currency: "USDT" });
      if (!merchantWallet) return res.status(404).json({ error: "Merchant wallet not found" });
  
      merchantWallet.balance += merchantAmount;
      await walletRepo.save(merchantWallet);
  
      await txRepo.save(txRepo.create({
        traderId: merchantId,
        currency: "USDT",
        type: "merchant_income",
        amount: merchantAmount,
        orderId,
        status: "confirmed",
      }));
  
      // Регистрация дохода платформы
      const platformWallet = await walletRepo.findOneBy({ traderId: "platform", currency: "USDT" });
      if (!platformWallet) return res.status(404).json({ error: "Platform wallet not found" });
  
      platformWallet.balance += platformProfit;
      await walletRepo.save(platformWallet);
  
      await txRepo.save(txRepo.create({
        traderId: "platform",
        currency: "USDT",
        type: "platform_profit",
        amount: platformProfit,
        orderId,
        status: "confirmed",
      }));
  
      // Возврат результата
      return res.json({
        totalAmount: amount,
        merchantReceived: merchantAmount,
        platformFee: platformCut,
        platformProfit: platformProfit,
        traderReward: reward,
        teamCommissions: teamCommissions.map(c => ({
          userId: c.userId,
          amount: c.amount
        })),
        commissionsSkipped: commissionUsers.length - teamCommissions.length,
        distribution: {
          merchant: parseFloat((merchantAmount / amount * 100).toFixed(2)) + '%',
          platform: parseFloat((platformCut / amount * 100).toFixed(2)) + '%',
          trader: parseFloat((reward / amount * 100).toFixed(2)) + '%',
          teamLeads: parseFloat((totalTeamCommissions / amount * 100).toFixed(2)) + '%'
        }
      });
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
  
      // Получаем правило вывода для трейдера (если есть)
      const rule = await ruleRepo.findOneBy({ traderId });
  
      // Проверяем правило, если оно есть
      if (rule) {
        // Проверка минимальной суммы
        if (parseFloat(amount) < parseFloat(rule.minAmount)) {
          return res.status(400).json({ error: `Amount below minimum withdrawal limit of ${rule.minAmount}` });
        }
  
        // Проверка комиссии: учитываем, что баланс должен покрывать сумму + фикс. комиссию
        const totalAmount = parseFloat(amount) + parseFloat(rule.fixedFee || 0);
        if (wallet.balance < totalAmount) {
          return res.status(400).json({ error: "Insufficient balance including withdrawal fee" });
        }
  
        // Проверка интервала между выводами (cooldown)
        if (rule.cooldownSeconds > 0) {
          const lastTx = await txRepo.findOne({
            where: { traderId, type: "withdraw" },
            order: { createdAt: "DESC" },
          });
  
          if (lastTx) {
            const now = new Date();
            const lastTime = new Date(lastTx.createdAt);
            const diffSeconds = (now - lastTime) / 1000;
  
            if (diffSeconds < rule.cooldownSeconds) {
              return res.status(400).json({
                error: `Cooldown active. Please wait ${Math.ceil(rule.cooldownSeconds - diffSeconds)} seconds before next withdrawal.`,
              });
            }
          }
        }
      } else {
        // Если правила нет, проверяем просто баланс >= amount
        if (wallet.balance < parseFloat(amount)) {
          return res.status(400).json({ error: "Insufficient balance" });
        }
      }
  
      // Получаем custody-кошелёк платформы
      const platformWallet = await walletRepo.findOneBy({
        traderId: "platform",
        currency: "USDT",
      });
      if (!platformWallet) {
        return res.status(500).json({ error: "Platform wallet not configured" });
      }
  
      // Выполняем перевод с платформенного кошелька — **сумму без комиссии**, комиссия снимается оффчейн
      const txHash = await Trc20Service.transfer(
        platformWallet.address,
        toAddress,
        amount,
        platformWallet.privateKey
      );
  
      // Списываем баланс с учетом комиссии, если правило есть
      if (rule) {
        wallet.balance -= totalAmount; // amount + fixedFee
      } else {
        wallet.balance -= parseFloat(amount);
      }
      await walletRepo.save(wallet);
  
      // Логируем транзакцию вывода с суммой (без комиссии)
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
        details: error.message || error.toString(),
      });
    }
  });

  // История операций
  app.get("/wallets/:traderId/history", async (req, res) => {
    const { traderId } = req.params;
    
    // Параметры пагинации с значениями по умолчанию
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
  
    try {
      // Запрос данных с пагинацией и фильтрацией
      const [transactions, total] = await txRepo.findAndCount({
        where: {
          traderId,
          type: Not("platform_fee") // Исключаем platform_fee
        },
        order: { createdAt: "DESC" },
        skip: offset,
        take: limit
      });
  
      // Расчет общего количества страниц
      const totalPages = Math.ceil(total / limit);
  
      // Формат ответа для фронтенд-пагинации
      res.json({
        history: transactions,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: page,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
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

      console.log(wallet.address)
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

  app.post("/wallets/reward-stats", async (req, res) => {
    const { traderId, from, to } = req.body;
  
    if (!traderId || !from || !to) {
      return res.status(400).json({ error: "Missing traderId, from, or to" });
    }
  
    try {
      const result = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(tx.amount)", "total")
        .where("tx.traderId = :traderId", { traderId })
        .andWhere("tx.type = :type", { type: "reward" })
        .andWhere("tx.createdAt BETWEEN :from AND :to", { from, to })
        .getRawOne();
  
      const total = result.total || 0;
  
      return res.json({
        traderId,
        from,
        to,
        rewardEarned: parseFloat(total),
      });
    } catch (error) {
      console.error("Error calculating reward stats:", error);
      return res.status(500).json({ error: "Failed to calculate reward stats" });
    }
  });

  app.post('/admin/withdrawal-rules', async (req, res) => {
    const { traderId, fixedFee, minAmount, cooldownSeconds } = req.body;
    if (!traderId) return res.status(400).json({ error: "traderId is required" });
  
    try {
      let rule = await ruleRepo.findOneBy({ traderId });
      if (!rule) {
        rule = ruleRepo.create({ traderId, fixedFee, minAmount, cooldownSeconds });
      } else {
        rule.fixedFee = fixedFee ?? rule.fixedFee;
        rule.minAmount = minAmount ?? rule.minAmount;
        rule.cooldownSeconds = cooldownSeconds ?? rule.cooldownSeconds;
      }
  
      await ruleRepo.save(rule);
      res.json({ success: true, rule });
    } catch (e) {
      console.error('Error setting withdrawal rule:', e);
      res.status(500).json({ error: e.message });
    }
  }); 

  app.get("/withdrawal-rules/:traderId", async (req, res) => {
    const { traderId } = req.params;
  
    try {
      const rule = await ruleRepo.findOneBy({ traderId });
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.json(rule);
    } catch (error) {
      console.error("Error fetching withdrawal rule:", error);
      res.status(500).json({ error: "Failed to fetch withdrawal rule" });
    }
  });
  
  app.delete("/withdrawal-rules/:traderId", async (req, res) => {
    const { traderId } = req.params;
  
    try {
      const result = await ruleRepo.delete({ traderId });
      if (result.affected === 0) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.json({ message: "Rule deleted successfully" });
    } catch (error) {
      console.error("Error deleting withdrawal rule:", error);
      res.status(500).json({ error: "Failed to delete withdrawal rule" });
    }
  });

  app.post("/wallets/commission-profit", async (req, res) => {
    const { traderId, from, to } = req.body;
  
    // Проверка обязательных параметров
    if (!traderId || !from || !to) {
      return res.status(400).json({
        error: "Missing required parameters: traderId, from, or to"
      });
    }
  
    try {
      // Выполняем запрос к базе данных
      const result = await txRepo
        .createQueryBuilder("tx")
        .select("SUM(tx.amount)", "totalCommission")
        .where("tx.traderId = :traderId", { traderId })
        .andWhere("tx.type = :type", { type: "team_lead_commission" })
        .andWhere("tx.createdAt BETWEEN :from AND :to", { from, to })
        .getRawOne();
  
      // Извлекаем результат (может быть null если нет транзакций)
      const totalCommission = parseFloat(result.totalCommission || 0);
  
      return res.json({
        traderId,
        from,
        to,
        totalCommission,
        currency: "USDT"
      });
    } catch (error) {
      console.error("Error calculating commission profit:", error);
      return res.status(500).json({
        error: "Failed to calculate commission profit",
        details: error.message
      });
    }
  });
  
  // setInterval(async () => {
  //   const wallets = await walletRepo.find({
  //     where: { traderId: Not('platform'), currency: 'USDT' },
  //   });
  
  //   await topUpIfNeeded(wallets);
  // }, 30000); // каждые 30 секунд

  // Запуск сервера
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`USDT-TRC20 Wallet service running on port ${PORT}`);
    console.log(`Tron network: ${process.env.TRON_NODE_URL}`);
  });
}).catch(error => {
  console.error("Database connection failed:", error);
});

// const startDepositForwarding = require('./src/infra/depositForwarder');
// startDepositForwarding({ tronWeb, dataSource: AppDataSource });