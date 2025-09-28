import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export type TxType = 'DEPOSIT' | 'WITHDRAW' | 'BET' | 'WIN';

export interface TransactionAttributes {
  id: string;
  userId: string;
  type: TxType;
  amount: number;
  meta?: any | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionCreationAttributes = Optional<TransactionAttributes, 'id' | 'meta' | 'createdAt' | 'updatedAt'>;

export class Transaction extends Model<TransactionAttributes, TransactionCreationAttributes> implements TransactionAttributes {
  declare id: string;
  declare userId: string;
  declare type: TxType;
  declare amount: number;
  declare meta: any | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initTransactionModel(sequelize: Sequelize) {
  Transaction.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      type: { type: DataTypes.ENUM('DEPOSIT', 'WITHDRAW', 'BET', 'WIN'), allowNull: false },
      amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
      // Map to TIMESTAMP/DATETIME in DB; let DB default set the value when omitted
      createdAt: { field: 'created_at', type: DataTypes.DATE, allowNull: true },
      meta: { type: DataTypes.JSON, allowNull: true },
    },
    {
      sequelize,
      tableName: 'transactions',
      underscored: true,
      indexes: [{ fields: ['user_id', 'created_at'] }],
    }
  );
}
