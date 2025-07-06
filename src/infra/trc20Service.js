const axios = require('axios');
const TronWeb = require('tronweb');

class Trc20Service {
  constructor() {
    // Проверка переменных окружения
    if (!process.env.TRON_NODE_URL) {
      throw new Error('TRON_NODE_URL is not defined in .env');
    }
    
    this.tronWeb = new TronWeb.TronWeb({
      fullHost: process.env.TRON_NODE_URL,
      headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    });
    
    this.contractAddress = process.env.USDT_TRC20_CONTRACT;
    this.apiKey = process.env.TRONGRID_API_KEY;
    this.nodeUrl = process.env.TRON_NODE_URL;
  }

  /**
   * Получение баланса USDT-TRC20 через прямой запрос к API
   * @param {string} address - TRON address in base58
   * @returns {Promise<number>} USDT balance
   */
  async getBalance(address) {
    try {
      // Проверка и нормализация адреса
      const normalizedAddress = this.normalizeAddress(address);
      
      // Конвертация адресов в hex-формат
      const hexAddress = this.tronWeb.address.toHex(normalizedAddress);
      const hexContract = this.tronWeb.address.toHex(this.contractAddress);
      
      // Формируем запрос для вызова метода контракта
      const response = await axios.post(
        `${this.nodeUrl}/wallet/triggerconstantcontract`,
        {
          owner_address: hexAddress,
          contract_address: hexContract,
          function_selector: "balanceOf(address)",
          parameter: this.encodeParameter('address', hexAddress),
          visible: true
        },
        {
          headers: { 
            'TRON-PRO-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      // Обработка ответа
      if (!response.data.constant_result || !response.data.constant_result[0]) {
        throw new Error('Invalid response from node: ' + JSON.stringify(response.data));
      }
      
      // Конвертация hex в decimal (USDT имеет 6 decimals)
      const balanceHex = '0x' + response.data.constant_result[0];
      const balance = parseInt(balanceHex, 16);
      return balance / 1000000;
    } catch (error) {
      console.error('Error getting balance via API:', 
        error.response?.data || error.message
      );
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Нормализация адреса
   */
  normalizeAddress(address) {
    // Убедимся, что адрес в верхнем регистре и начинается с 'T'
    let normalized = address.trim().toUpperCase();
    
    if (!normalized.startsWith('T')) {
      throw new Error(`Invalid TRON address format: ${address}`);
    }
    
    // Проверка длины адреса
    if (normalized.length !== 34) {
      throw new Error(`Invalid TRON address length: ${address}`);
    }
    
    return normalized;
  }

  /**
   * Кодирование параметров для вызова контракта
   */
  encodeParameter(type, value) {
    // Для address: удаляем префикс 41 и дополняем до 64 символов
    if (type === 'address') {
      const cleanValue = value.startsWith('41') ? value.slice(2) : value;
      return cleanValue.padStart(64, '0');
    }
    throw new Error(`Unsupported parameter type: ${type}`);
  }

  /**
   * Альтернативный метод получения баланса через события
   */
  async getBalanceViaEvents(address) {
    try {
      const normalizedAddress = this.normalizeAddress(address);
      const hexAddress = this.tronWeb.address.toHex(normalizedAddress);
      
      const response = await axios.get(
        `${this.nodeUrl}/v1/accounts/${hexAddress}/transactions/trc20`,
        {
          params: {
            contract_address: this.contractAddress,
            only_confirmed: true,
            limit: 1
          },
          headers: { 
            'TRON-PRO-API-KEY': this.apiKey
          }
        }
      );
      
      if (response.data.data && response.data.data.length > 0) {
        const lastTx = response.data.data[0];
        return parseFloat(lastTx.to_balance);
      }
      
      return 0;
    } catch (error) {
      console.error('Error getting balance via events:', error);
      throw new Error('Failed to get balance via events');
    }
  }
}

module.exports = new Trc20Service();