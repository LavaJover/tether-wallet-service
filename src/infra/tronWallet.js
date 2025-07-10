// src/infra/tronWallet.js
const TronWeb = require('tronweb');
const { encrypt, decrypt } = require('./cryptoUtils');

class TronWalletManager {
    constructor() {
      this.tronWeb = new TronWeb.TronWeb({
        fullHost: process.env.TRON_NODE_URL,
        headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
        privateKey: process.env.TRON_PRIVATE_KEY
      });
    }

  /**
   * Генерация нового TRON-адреса
   * @returns {Promise<{address: string, privateKey: string, hexAddress: string}>}
   */
  async generateAddress() {
    try {
      // Создаем аккаунт синхронно
      const account = TronWeb.utils.accounts.generateAccount();
      
      if (!account || !account.address) {
        throw new Error('Failed to create account: account object is invalid');
      }
      
      // Проверяем наличие необходимых свойств
      if (!account.address.base58 || !account.address.hex || !account.privateKey) {
        console.error('Invalid account structure:', account);
        throw new Error('Account structure is missing required properties');
      }
      
      return {
        address: account.address.base58,
        hexAddress: account.address.hex,
        privateKey: account.privateKey
      };
    } catch (error) {
      console.error('Error generating address:', error);
      throw new Error('Failed to generate TRON address: ' + error.message);
    }
  }

  /**
   * Получение подписанта для транзакций
   * @param {string} encryptedPrivateKey - Зашифрованный приватный ключ
   * @returns {Promise<TronWeb>} Экземпляр TronWeb с установленным приватным ключом
   */
  async getSigner(encryptedPrivateKey) {
    try {
      const privateKey = await decrypt(encryptedPrivateKey, process.env.ENCRYPTION_KEY);
      
      return new TronWeb({
        fullHost: process.env.TRON_NODE_URL,
        headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
        privateKey: privateKey
      });
    } catch (error) {
      console.error('Error getting signer:', error);
      throw new Error('Failed to initialize signer');
    }
  }

  /**
   * Конвертация адреса в hex формат
   * @param {string} address - Базовый58 адрес
   * @returns {string} Hex-адрес
   */
  toHex(address) {
    return this.tronWeb.address.toHex(address);
  }

  /**
   * Конвертация hex адреса в базовый58 формат
   * @param {string} hexAddress - Адрес в hex
   * @returns {string} Базовый58 адрес
   */
  toBase58(hexAddress) {
    return this.tronWeb.address.fromHex(hexAddress);
  }
}

module.exports = new TronWalletManager();