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
  
  
}

module.exports = new Trc20Service();
