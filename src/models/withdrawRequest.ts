import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type WithdrawStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WithdrawRequestAttributes {
  id: string;
  userId: string;
  amount: number;
  method: string;
  dest?: string | null;
  status: WithdrawStatus;
  createdAtMs: number;
  reviewedAtMs?: number | null;
  reviewedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WithdrawRequestCreationAttributes = Optional<WithdrawRequestAttributes, 'id' | 'dest' | 'status' | 'createdAtMs' | 'reviewedAtMs' | 'reviewedBy' | 'createdAt' | 'updatedAt'>;

export class WithdrawRequest extends Model<WithdrawRequestAttributes, WithdrawRequestCreationAttributes> implements WithdrawRequestAttributes {
  declare id: string;
  declare userId: string;
  declare amount: number;
  declare method: string;
  declare dest: string | null;
  declare status: WithdrawStatus;
  declare createdAtMs: number;
  declare reviewedAtMs: number | null;
  declare reviewedBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWithdrawRequestModel(sequelize: Sequelize) {
  WithdrawRequest.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      amount: { type: DataTypes.DECIMAL(18,2), allowNull: false },
      method: { type: DataTypes.STRING(32), allowNull: false },
      dest: { type: DataTypes.STRING(255), allowNull: true },
      status: { type: DataTypes.ENUM('PENDING','APPROVED','REJECTED'), allowNull: false, defaultValue: 'PENDING' },
      createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false, defaultValue: () => Date.now() },
      reviewedAtMs: { field: 'reviewed_at', type: DataTypes.BIGINT, allowNull: true },
      reviewedBy: { field: 'reviewed_by', type: DataTypes.STRING(32), allowNull: true },
    },
    { sequelize, tableName: 'withdraw_requests', underscored: true, timestamps: false, indexes: [{ fields: ['user_id','created_at'] }, { fields: ['status','created_at'] }] }
  );
}
