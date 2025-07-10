const TronWeb = require('tronweb');
const tronWeb = new TronWeb.TronWeb({
  fullHost: 'https://api.trongrid.io'
});

(async () => {
  try {
    const hex = tronWeb.address.toHex('THQEc5LcWKPraiAnWEzQJaGjKpwTGFiAkV');
    console.log('Hex address:', hex);
    
    const account = await tronWeb.trx.getAccount('THQEc5LcWKPraiAnWEzQJaGjKpwTGFiAkV');
    console.log('Account info:', account);
  } catch (e) {
    console.error('Invalid address or network error:', e.message);
  }
})();