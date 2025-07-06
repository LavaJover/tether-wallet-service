require('dotenv').config();
const Trc20Service = require('../src/infra/trc20Service');

async function test() {
  try {
    // Замените на реальный адрес
    const address = 'TSHyK6oj9yE5WwUZazpLyBcTZ6quGBfLfn';
    
    console.log('Testing contract initialization...');
    await Trc20Service.ensureContract();
    
    console.log('Testing balance retrieval...');
    const balance = await Trc20Service.getBalance(address);
    
    console.log('Balance:', balance, 'USDT');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();