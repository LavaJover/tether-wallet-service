const axios = require('axios');
const TronWeb = require('tronweb');

class TronWebhooks {
  constructor(tronWebInstance) {
    if (!tronWebInstance) {
      throw new Error('TronWeb instance is required');
    }
    this.tronWeb = tronWebInstance;
    this.activePolls = {};
  }

  async subscribeToAddress(address) {
    try {
      const hexAddress = this.tronWeb.address.toHex(address);
      const contractAddress = this.tronWeb.address.toHex(process.env.USDT_TRC20_CONTRACT);
      
      const response = await axios.post(
        `${this.tronWeb.fullNode.host}/v1/accounts/${hexAddress}/events`,
        {
          event_name: "Transfer",
          contract_address: contractAddress,
          only_confirmed: true
        },
        {
          headers: { 
            'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error subscribing to events:', 
        error.response?.data || error.response || error.message
      );
      
      // Автоматически запускаем polling при ошибке подписки
      this.startAddressPolling(address);
      
      throw error;
    }
  }

  startAddressPolling(address) {
    if (this.activePolls[address]) return;
    
    console.log(`Starting polling for address: ${address}`);
    
    const poll = async () => {
      try {
        // Используем this.tronWeb через замыкание
        const transactions = await this.tronWeb.trx.getTransactionsRelated(
          address,
          'to',
          'only_confirmed',
          0,
          10
        );
        
        if (transactions && transactions.data && transactions.data.length > 0) {
          transactions.data.forEach(tx => {
            if (tx.raw_data.contract[0].parameter.value.to_address === address) {
              console.log('New transaction detected:', tx.txID);
              // Здесь должна быть логика обработки депозита
            }
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      } finally {
        // Перезапускаем таймер
        this.activePolls[address] = setTimeout(poll, 30000);
      }
    };
    
    // Первый запуск
    this.activePolls[address] = setTimeout(poll, 0);
  }

  stopAddressPolling(address) {
    if (this.activePolls[address]) {
      clearTimeout(this.activePolls[address]);
      delete this.activePolls[address];
      console.log(`Stopped polling for address: ${address}`);
    }
  }
}

module.exports = TronWebhooks;