import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export interface CrashBetAttributes {
  id: string;
  roundId: number;
  userId: string;
  amount: number;
  cashedOut: boolean;
  cashoutMultiplier?: number | null;
  createdAtMs: number;
  cashedOutAt?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CrashBetCreationAttributes = Optional<CrashBetAttributes, 'id' | 'cashedOut' | 'cashoutMultiplier' | 'cashedOutAt' | 'createdAt' | 'updatedAt'>;

export class CrashBet extends Model<CrashBetAttributes, CrashBetCreationAttributes> implements CrashBetAttributes {
  declare id: string;
  declare roundId: number;
  declare userId: string;
  declare amount: number;
  declare cashedOut: boolean;
  declare cashoutMultiplier: number | null;
  declare createdAtMs: number;
  declare cashedOutAt: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCrashBetModel(sequelize: Sequelize) {
  CrashBet.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false },
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
      cashedOut: { field: 'cashed_out', type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      cashoutMultiplier: { field: 'cashout_multiplier', type: DataTypes.DECIMAL(10, 2), allowNull: true },
      createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false },
      cashedOutAt: { field: 'cashed_out_at', type: DataTypes.BIGINT, allowNull: true },
    },
    { sequelize, tableName: 'crash_bets', underscored: true, indexes: [{ fields: ['round_id'] }, { fields: ['user_id', 'round_id'] }] }
  );
}
