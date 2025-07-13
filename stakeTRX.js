const TronWeb = require('tronweb');
const dotenv = require("dotenv");
dotenv.config();


const tronWeb = new TronWeb.TronWeb({
  fullHost: process.env.TRON_NODE_URL,
  headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
  privateKey: process.env.PLATFORM_PRIVATE_KEY
});

async function stakeTRX() {
  try {
    console.log(process.env.PLATFORM_PRIVATE_KEY)
    const sender = await tronWeb.defaultAddress.base58;
    console.log('Sender address:', sender);
    console.log('Private key:', process.env.PLATFORM_PRIVATE_KEY);
    console.log('Sender address:', tronWeb.defaultAddress.base58);
    console.log('Is address valid:', tronWeb.isAddress(tronWeb.defaultAddress.base58));


    const frozenAmountSun = 100_000_000; // 100 TRX в SUN
    const durationDays = 3;

    const tx = await tronWeb.trx.freezeBalance(
      frozenAmountSun,
      durationDays,
      'ENERGY',
      sender
    );

    console.log('✅ Freeze transaction broadcasted:', tx);
  } catch (err) {
    console.error('❌ Failed to freeze TRX:', err);
  }
}

stakeTRX();