const TronWeb = require('tronweb');
const dotenv = require("dotenv");
dotenv.config();


const MIN_REQUIRED_TRX = parseInt(process.env.MIN_REQUIRED_TRX || '500000'); // в SUN
const TOP_UP_AMOUNT_TRX = parseFloat(process.env.TOP_UP_AMOUNT_TRX || '1');  // в TRX

const tronWeb = new TronWeb.TronWeb({
  fullHost: process.env.TRON_NODE_URL,
  headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
  privateKey: process.env.PLATFORM_PRIVATE_KEY
});

async function topUpIfNeeded(wallets) {
  for (const wallet of wallets) {
    try {
      const balanceSun = await tronWeb.trx.getBalance(wallet.address);
      if (balanceSun >= MIN_REQUIRED_TRX) {
        continue; // TRX хватает
      }

      const receipt = await sendTrx(wallet.address, TOP_UP_AMOUNT_TRX);
      console.log(`💸 Sent ${TOP_UP_AMOUNT_TRX} TRX to ${wallet.address}`, receipt);

    } catch (err) {
      console.error(`❌ Failed to top up ${wallet.address}:`, err.message);
    }
  }
}

async function sendTrx(toAddress, amountInTrx) {
  const amountInSun = tronWeb.toSun(amountInTrx);
  const tx = await tronWeb.transactionBuilder.sendTrx(
    toAddress,
    amountInSun,
    'TYWfeYRnQasKsUTJMGBM9xTSoyDvDwDh7P'
  );
  const signed = await tronWeb.trx.sign(tx);
  return await tronWeb.trx.sendRawTransaction(signed);
}

module.exports = { topUpIfNeeded };
