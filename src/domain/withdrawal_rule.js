const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'WithdrawalRule',
  tableName: 'withdrawal_rules',
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true,
    },
    traderId: {
      type: 'uuid',
      nullable: false,
      unique: true,
    },
    fixedFee: {
      type: 'decimal',
      precision: 24,
      scale: 6,
      default: 0,
    },
    minAmount: {
      type: 'decimal',
      precision: 24,
      scale: 6,
      default: 0,
    },
    cooldownSeconds: {
      type: 'int',
      default: 0,
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true,
    },
    createdAt: {
      type: 'timestamp',
      createDate: true,
    },
  },
  indices: [
    {
      name: 'IDX_WITHDRAWAL_RULE_TRADER',
      columns: ['traderId'],
    }
  ]
});
