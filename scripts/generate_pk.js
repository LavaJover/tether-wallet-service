const TronWeb = require('tronweb');
const dotenv = require("dotenv");
console.log(process.env.TRON_NODE_URL)
const tronWeb = new TronWeb.TronWeb({
    fullHost: 'https://api.trongrid.io',
  });
  
const account = TronWeb.utils.accounts.generateAccount();
const walletAddress = account.address.base58;
const privateKey = account.privateKey;
console.log(privateKey)