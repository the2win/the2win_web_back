import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface BankAccountAttributes {
  id: string; // stored as string for BIGINT
  userId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: number; // 0/1
  createdAt?: Date;
}

export type BankAccountCreationAttributes = Optional<BankAccountAttributes, 'id' | 'isDefault' | 'createdAt'>;

export class BankAccount extends Model<BankAccountAttributes, BankAccountCreationAttributes> implements BankAccountAttributes {
  declare id: string;
  declare userId: string;
  declare bankName: string;
  declare accountNumber: string;
  declare accountHolder: string;
  declare isDefault: number;
  declare readonly createdAt: Date;
}

export function initBankAccountModel(sequelize: Sequelize) {
  BankAccount.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true } as any,
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      bankName: { field: 'bank_name', type: DataTypes.STRING(120), allowNull: false },
      accountNumber: { field: 'account_number', type: DataTypes.STRING(64), allowNull: false },
      accountHolder: { field: 'account_holder', type: DataTypes.STRING(120), allowNull: false },
      isDefault: { field: 'is_default', type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    },
    { sequelize, tableName: 'bank_accounts', underscored: true, timestamps: false, indexes: [{ fields: ['user_id'] }] }
  );
}
