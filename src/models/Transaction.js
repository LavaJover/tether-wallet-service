const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'WalletTransaction',
  tableName: 'wallet_transactions',
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true,
    },
    traderId: {
      type: 'varchar',
      length: 100,
    },
    currency: {
      type: 'varchar',
      length: 10,
      default: 'USDT',
    },
    type: {
      type: 'varchar',
      length: 20, // deposit, withdraw, freeze, release, reward
    },
    amount: {
      type: 'decimal',
      precision: 24,
      scale: 6,
    },
    txHash: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    orderId: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    status: {
      type: 'varchar',
      length: 20, // pending, confirmed, failed
      default: 'pending',
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
      name: 'IDX_TRADER_ID',
      columns: ['traderId'],
    },
    {
      name: 'IDX_ORDER_ID',
      columns: ['orderId'],
    },
    {
      name: 'IDX_TX_HASH',
      columns: ['txHash'],
    },
  ],
});