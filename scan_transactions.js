require('dotenv').config();
const { DataSource } = require('typeorm');
const TronWeb = require('tronweb');
const axios = require('axios');

// 1. Настройка подключения к БД
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: [
    require("./src/domain/wallet"),
    require("./src/domain/wallet_transaction")
  ],
});

// 2. Конфигурация Tron
const tronWeb = new TronWeb.TronWeb({
  fullHost: process.env.TRON_NODE_URL,
  headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
});

// 3. Конфигурация USDT-TRC20
const USDT_CONTRACT = process.env.USDT_TRC20_CONTRACT;

// 4. Основная функция мониторинга
async function monitorDeposits() {
  console.log('Starting deposit monitoring...');
  
  // Подключение к БД
  await AppDataSource.initialize();
  const walletRepo = AppDataSource.getRepository("Wallet");
  const txRepo = AppDataSource.getRepository("WalletTransaction");
  
  // Получаем все адреса кошельков из БД
  const wallets = await walletRepo.find();
  console.log(`Found ${wallets.length} wallets to monitor`);
  
  // Мониторинг для каждого кошелька
  for (const wallet of wallets) {
    try {
      console.log(`Checking deposits for wallet: ${wallet.address}`);
      
      // Проверяем входящие транзакции
      await checkDeposits(wallet, walletRepo, txRepo);
      
    } catch (error) {
      console.error(`Error monitoring wallet ${wallet.address}:`, error);
    }
  }
  
  // Закрываем соединение с БД
  await AppDataSource.destroy();
  console.log('Monitoring completed');
}

// 5. Проверка входящих транзакций (TRX и USDT)
async function checkDeposits(wallet, walletRepo, txRepo) {
  try {
    const hexAddress = tronWeb.address.toHex(wallet.address);
    
    // Получаем транзакции через новый API
    const response = await axios.get(
      `${tronWeb.fullNode.host}/v1/accounts/${hexAddress}/transactions`,
      {
        params: {
          only_confirmed: true,
          limit: 20,
          order_by: 'block_timestamp,desc'
        },
        headers: { 
          'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY,
          'Accept': 'application/json'
        }
      }
    );
    
    const transactions = response.data.data || [];
    if (transactions.length === 0) {
      console.log(`No new transactions for ${wallet.address}`);
      return;
    }
    
    console.log(`Found ${transactions.length} transactions for ${wallet.address}`);
    
    // Обрабатываем каждую транзакцию
    for (const tx of transactions) {
      // Пропускаем если уже обработали
      const existingTx = await txRepo.findOneBy({ txHash: tx.tx_id });
      if (existingTx) continue;
      
      // Определяем тип транзакции и сумму
      let currency, amount, fromAddress;
      
      // TRX транзакция
      if (tx.raw_data.contract[0].type === 'TransferContract') {
        const value = tx.raw_data.contract[0].parameter.value;
        currency = 'TRX';
        amount = tronWeb.fromSun(value.amount);
        fromAddress = tronWeb.address.fromHex(value.owner_address);
      }
      // USDT-TRC20 транзакция
      else if (tx.raw_data.contract[0].type === 'TriggerSmartContract' && 
               tx.raw_data.contract[0].parameter.value.contract_address === USDT_CONTRACT) {
        
        // Декодируем данные транзакции
        const transferData = await decodeUsdtTransfer(tx.tx_id);
        if (!transferData) continue;
        
        currency = 'USDT';
        amount = transferData.amount;
        fromAddress = transferData.from;
      }
      // Неподдерживаемый тип транзакции
      else {
        continue;
      }
      
      // Зачисляем средства
      wallet.balance = parseFloat(wallet.balance) + parseFloat(amount);
      await walletRepo.save(wallet);
      
      // Сохраняем транзакцию
      await txRepo.save({
        traderId: wallet.traderId,
        currency,
        type: 'deposit',
        amount,
        txHash: tx.tx_id,
        status: 'confirmed'
      });
      
      console.log(`Deposited ${amount} ${currency} to ${wallet.address} from ${fromAddress}`);
    }
  } catch (error) {
    console.error(`Deposit error for ${wallet.address}:`, 
      error.response?.data || error.message
    );
  }
}

// 6. Декодирование USDT-TRC20 транзакции
async function decodeUsdtTransfer(txId) {
  try {
    // Получаем информацию о транзакции
    const response = await axios.get(
      `${tronWeb.fullNode.host}/v1/transactions/${txId}/events`,
      {
        headers: { 
          'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY,
          'Accept': 'application/json'
        }
      }
    );
    
    const events = response.data.data || [];
    
    // Ищем событие Transfer
    const transferEvent = events.find(e => e.event_name === 'Transfer');
    if (!transferEvent) return null;
    
    // Извлекаем данные
    const from = tronWeb.address.fromHex(transferEvent.result.from);
    const to = tronWeb.address.fromHex(transferEvent.result.to);
    const value = transferEvent.result.value;
    
    // Конвертируем значение (6 знаков для USDT)
    const amount = tronWeb.fromSun(value, 6);
    
    return {
      from,
      to,
      amount
    };
  } catch (error) {
    console.error(`Error decoding USDT transfer ${txId}:`, error);
    return null;
  }
}

// 7. Запуск мониторинга с интервалом
async function startMonitoring(intervalMinutes = 5) {
  try {
    await monitorDeposits();
  } catch (error) {
    console.error('Monitoring failed:', error);
  }
  
  // Перезапускаем через указанный интервал
  setTimeout(() => startMonitoring(intervalMinutes), intervalMinutes * 60 * 1000);
}

// 8. Запуск скрипта
startMonitoring(0.5); // Проверка каждые 5 минут