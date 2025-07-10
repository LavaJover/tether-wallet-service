const { Not } = require("typeorm");
const Trc20Service = require('./trc20Service');
const { decrypt } = require("./cryptoUtils");
const dotenv = require("dotenv");
dotenv.config();

module.exports = function startDepositForwarding({ dataSource }) {
  const walletRepo = dataSource.getRepository("Wallet");
  const txRepo = dataSource.getRepository("WalletTransaction");

  setInterval(async () => {
    try {
      const userWallets = await walletRepo.find({
        where: { traderId: Not('platform'), currency: 'USDT' },
      });

      const platformWallet = await walletRepo.findOneBy({ traderId: 'platform', currency: 'USDT' });
      if (!platformWallet) throw new Error("Platform wallet not found");

      for (const wallet of userWallets) {
        // Получаем баланс через новый Trc20Service
        const balance = await Trc20Service.getBalance(wallet.address);

        if (balance > 0.000001) {
          console.log(`📥 Incoming USDT ${balance} on ${wallet.address}`);

          // 1. Off-chain начисление
          wallet.balance += balance;
          await walletRepo.save(wallet);

          // 2. Логируем как депозит
          await txRepo.save(txRepo.create({
            traderId: wallet.traderId,
            currency: 'USDT',
            type: 'deposit',
            amount: balance,
            status: 'confirmed',
          }));

          // 3. Расшифровываем приватный ключ для подписи перевода

          // 4. Переводим средства на custody (platform)
          const txHash = await Trc20Service.transfer(
            wallet.address,
            platformWallet.address,
            balance,
            wallet.privateKey
          );

          // 5. Логируем перевод
          await txRepo.save(txRepo.create({
            traderId: wallet.traderId,
            currency: 'USDT',
            type: 'forward_to_custody',
            amount: balance,
            txHash,
            status: 'pending',
          }));

          console.log(`✅ Forwarded ${balance} USDT from ${wallet.address} → ${platformWallet.address}`);
        }
      }
    } catch (error) {
      console.error("Forwarding error:", error.message);
    }
  }, 15000); // каждые 15 секунд
};