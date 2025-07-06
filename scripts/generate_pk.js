const TronWeb = require('tronweb');
const tronWeb = new TronWeb.TronWeb({
    fullHost: "https://api.shasta.trongrid.io",
  });
  
const account = TronWeb.utils.accounts.generateAccount();
const walletAddress = account.address.base58;
const privateKey = account.privateKey;
console.log(privateKey)