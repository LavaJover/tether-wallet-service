const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Wallet',
  tableName: 'wallets',
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true,
    },
    traderId: {
      type: 'varchar',
      length: 50,
      nullable: false,
    },
    currency: {
      type: 'varchar',
      length: 10,
      default: 'USDT',
    },
    address: {
      type: 'varchar',
      length: 50,
      nullable: false,
      unique: true,
    },
    balance: {
      type: 'float',
      default: 0,
    },
    frozen: {
      type: 'float',
      default: 0,
    },
    privateKey: {
      type: 'varchar',
      length: 255,
      nullable: false,
    },
    createdAt: {
      type: 'timestamp',
      createDate: true,
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true,
    },
  },
  indices: [
    {
      name: 'IDX_WALLET_TRADER_ID',
      columns: ['traderId'],
    },
    {
      name: 'IDX_WALLET_ADDRESS',
      columns: ['address'],
      unique: true,
    },
  ],
  uniques: [
    {
      name: 'UNIQUE_TRADER_CURRENCY',
      columns: ['traderId', 'currency']
    }
  ]
});