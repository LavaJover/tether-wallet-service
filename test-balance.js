const TronWeb = require('tronweb');

// Конфигурация для сети Shasta
const shastaConfig = {
  fullNode: 'https://api.shasta.trongrid.io',
  solidityNode: 'https://api.shasta.trongrid.io',
  eventServer: 'https://api.shasta.trongrid.io'
};

// Адрес контракта USDT в сети Shasta (TRC-20)
const USDT_CONTRACT_ADDRESS = 'TG4CbQ3Vjq4oak7qPKxEn8N7ZMzRP77YDF';

// Замените на свой адрес кошелька
const YOUR_WALLET_ADDRESS = 'TSHyK6oj9yE5WwUZazpLyBcTZ6quGBfLfn';

async function getUSDTBalance() {
  try {
    // Инициализация TronWeb
    const tronWeb = new TronWeb.TronWeb(shastaConfig);
    
    // Преобразуем адрес в hex-формат
    const hexAddress = tronWeb.address.toHex(YOUR_WALLET_ADDRESS);
    
    // Создание экземпляра контракта
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Явно указываем адрес при вызове метода
    const balance = await contract.balanceOf(hexAddress).call({
      from: hexAddress  // Ключевое исправление!
    });
    
    // Конвертация из sun (1 USDT = 1,000,000 sun)
    const formattedBalance = tronWeb.fromSun(balance.toString(), 'trx', 6);
    
    console.log(`USDT Balance: ${formattedBalance}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Запуск функции
getUSDTBalance();