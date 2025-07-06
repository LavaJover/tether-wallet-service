const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'TraderWalletIndex',
  tableName: 'trader_wallet_index',
  columns: {
    traderId: {
      primary: true,
      type: 'uuid',
    },
    hdIndex: {
      type: 'int',
      default: 0,
    },
  },
  indices: [
    {
      name: 'IDX_TRADER_ID',
      columns: ['traderId'],
      unique: true,
    }
  ]
});