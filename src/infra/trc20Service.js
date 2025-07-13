const TronWeb = require('tronweb');

class Trc20Service {
  constructor() {
    if (!process.env.TRON_NODE_URL) {
      throw new Error('TRON_NODE_URL is not defined in .env');
    }
    if (!process.env.TRONGRID_API_KEY) {
      throw new Error('TRONGRID_API_KEY is not defined in .env');
    }
    if (!process.env.USDT_TRC20_CONTRACT) {
      throw new Error('USDT_TRC20_CONTRACT is not defined in .env');
    }

    this.tronWeb = new TronWeb.TronWeb({
      fullHost: process.env.TRON_NODE_URL,
      headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    });
    this.contractAddress = process.env.USDT_TRC20_CONTRACT;
  }

  /**
   * Получение баланса TRC20 (USDT)
   * @param {string} address - Адрес в base58 формате
   * @returns {Promise<number>} Баланс в токенах (например, USDT)
   */
  async getBalance(address) {
    try {
      if (!this.tronWeb.isAddress(address)) {
        throw new Error(`Invalid TRON address: ${address}`);
      }
  
      const hexAddress = this.tronWeb.address.toHex(address).replace(/^0x/, '');
      console.log('hexAddress for balanceOf:', hexAddress);
      console.log('Contract address:', this.contractAddress);
  
      const contract = await this.tronWeb.contract().at(this.contractAddress);
  
      // Важно передать опцию from с валидным hex-адресом (например, любой существующий адрес)
      // Обычно можно взять платформенный адрес из env или нулевой адрес 41 + 40 нулей
  
      const fromAddress = this.tronWeb.address.toHex(process.env.PLATFORM_ADDRESS || 'TYWfeYRnQasKsUTJMGBM9xTSoyDvDwDh7P'); // пример адреса
  
      const balanceBigNumber = await contract.balanceOf(hexAddress).call({ from: fromAddress });
  
      console.log('Raw balance:', balanceBigNumber.toString());
  
      return Number(balanceBigNumber.toString()) / 1e6;
    } catch (error) {
      console.error('Error in getBalance:', error);
      throw error;
    }
  }

  /**
 * Отправка TRC20 (USDT) токенов
 * @param {string} fromAddress - Отправитель (Base58)
 * @param {string} toAddress - Получатель (Base58)
 * @param {number} amount - Сумма в токенах (например, 12.5)
 * @param {string} privateKey - Приватный ключ отправителя
 * @returns {Promise<string>} txHash
 */
async transfer(fromAddress, toAddress, amount, privateKey) {
  try {
    if (!this.tronWeb.isAddress(fromAddress)) {
      throw new Error(`Invalid fromAddress: ${fromAddress}`);
    }
    if (!this.tronWeb.isAddress(toAddress)) {
      throw new Error(`Invalid toAddress: ${toAddress}`);
    }

    const contract = await this.tronWeb.contract().at(this.contractAddress);

    // Устанавливаем приватный ключ для подписи транзакции
    const tronWebWithPK = new TronWeb.TronWeb({
      fullHost: process.env.TRON_NODE_URL,
      privateKey: privateKey,
      headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    });

    const contractWithPK = await tronWebWithPK.contract().at(this.contractAddress);

    const amountInSun = Math.floor(amount * 1e6); // USDT имеет 6 знаков после запятой

    console.log(`🔁 Sending ${amountInSun} USDT from ${fromAddress} to ${toAddress}...`);
    const account = await tronWebWithPK.trx.getAccount(fromAddress);
    console.log('→ Platform account info:', account);
    const tx = await contractWithPK.transfer(toAddress, amountInSun).send({
      feeLimit: 50_000_000
    });

    console.log(`✅ Sent! txHash: ${tx}`);
    return tx;
  } catch (error) {
    console.error("❌ Error in transfer:", error);
    throw new Error(`TRC20 transfer failed: ${error.message}`);
  }
} 
  
}

module.exports = new Trc20Service();
