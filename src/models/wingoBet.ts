import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export type WingoColor = 'GREEN' | 'PURPLE' | 'RED';

export interface WingoBetAttributes {
  id: string;
  roundId: number;
  userId: string;
  selection: WingoColor;
  amount: number;
  createdAtMs: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WingoBetCreationAttributes = Optional<WingoBetAttributes, 'id' | 'createdAtMs' | 'createdAt' | 'updatedAt'>;

export class WingoBet extends Model<WingoBetAttributes, WingoBetCreationAttributes> implements WingoBetAttributes {
  declare id: string;
  declare roundId: number;
  declare userId: string;
  declare selection: WingoColor;
  declare amount: number;
  declare createdAtMs: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWingoBetModel(sequelize: Sequelize) {
  WingoBet.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false },
      userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
      selection: { type: DataTypes.ENUM('GREEN', 'PURPLE', 'RED'), allowNull: false },
      amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
      createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false },
    },
    { sequelize, tableName: 'wingo_bets', underscored: true, indexes: [{ fields: ['round_id'] }, { fields: ['user_id', 'round_id'] }] }
  );
}
