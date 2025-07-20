const TronWeb = require('tronweb');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const https = require('https');

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  timeout: 60000
});

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
      headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
      timeout: 120_000,
      agent: keepAliveAgent
    });

    this.contractAddress = process.env.USDT_TRC20_CONTRACT;
  }

  async retry(fn, retries = 3, delayMs = 2000) {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt >= retries) throw error;
        console.warn(`Retry attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  async getBalance(address) {
    return this.retry(async () => {
      if (!this.tronWeb.isAddress(address)) {
        throw new Error(`Invalid TRON address: ${address}`);
      }

      const hexAddress = this.tronWeb.address.toHex(address).replace(/^0x/, '');
      console.log('hexAddress for balanceOf:', hexAddress);
      console.log('Contract address:', this.contractAddress);

      const contract = await this.tronWeb.contract().at(this.contractAddress);
      const fromAddress = this.tronWeb.address.toHex(process.env.PLATFORM_ADDRESS || 'TYWfeYRnQasKsUTJMGBM9xTSoyDvDwDh7P');

      const balanceBigNumber = await contract.balanceOf(hexAddress).call({ from: fromAddress });
      console.log('Raw balance:', balanceBigNumber.toString());

      return Number(balanceBigNumber.toString()) / 1e6;
    });
  }

  async transfer(fromAddress, toAddress, amount, privateKey) {
    // return this.retry(async () => {
      if (!this.tronWeb.isAddress(fromAddress)) {
        throw new Error(`Invalid fromAddress: ${fromAddress}`);
      }
      if (!this.tronWeb.isAddress(toAddress)) {
        throw new Error(`Invalid toAddress: ${toAddress}`);
      }

      const tronWebWithPK = new TronWeb.TronWeb({
        fullHost: process.env.TRON_NODE_URL,
        privateKey,
        headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
        timeout: 120_000 // ⬅️ Увеличен таймаут
      });

      const contractWithPK = await tronWebWithPK.contract().at(this.contractAddress);

      const amountInSun = Math.floor(amount * 1e6);
      console.log(`🔁 Sending ${amountInSun} USDT from ${fromAddress} to ${toAddress}...`);

      const account = await tronWebWithPK.trx.getAccount(fromAddress);
      console.log('→ Platform account info:', account);

      const tx = await contractWithPK.transfer(toAddress, amountInSun).send({
        feeLimit: 40_000_000
      });

      console.log(`✅ Sent! txHash: ${tx}`);
      return tx;
    // });
  }
}

module.exports = new Trc20Service();
