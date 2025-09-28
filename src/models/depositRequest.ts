import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DepositRequestAttributes {
  id: string;
  userId: string;
  amount: number;
  method: string;
  receiptPath?: string | null;
  status: DepositStatus;
  createdAtMs: number;
  reviewedAtMs?: number | null;
  reviewedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DepositRequestCreationAttributes = Optional<DepositRequestAttributes, 'id' | 'receiptPath' | 'status' | 'createdAtMs' | 'reviewedAtMs' | 'reviewedBy' | 'createdAt' | 'updatedAt'>;

export class DepositRequest extends Model<DepositRequestAttributes, DepositRequestCreationAttributes> implements DepositRequestAttributes {
  declare id: string;
  declare userId: string;
  declare amount: number;
  declare method: string;
  declare receiptPath: string | null;
  declare status: DepositStatus;
  declare createdAtMs: number;
  declare reviewedAtMs: number | null;
  declare reviewedBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initDepositRequestModel(sequelize: Sequelize) {
  DepositRequest.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      amount: { type: DataTypes.DECIMAL(18,2), allowNull: false },
      method: { type: DataTypes.STRING(32), allowNull: false },
      receiptPath: { field: 'receipt_path', type: DataTypes.STRING(255), allowNull: true },
      status: { type: DataTypes.ENUM('PENDING','APPROVED','REJECTED'), allowNull: false, defaultValue: 'PENDING' },
      createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false, defaultValue: () => Date.now() },
      reviewedAtMs: { field: 'reviewed_at', type: DataTypes.BIGINT, allowNull: true },
      reviewedBy: { field: 'reviewed_by', type: DataTypes.STRING(32), allowNull: true },
    },
    { sequelize, tableName: 'deposit_requests', underscored: true, timestamps: false, indexes: [{ fields: ['user_id','created_at'] }, { fields: ['status','created_at'] }] }
  );
}
