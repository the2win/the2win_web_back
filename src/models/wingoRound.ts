import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export type WingoColor = 'GREEN' | 'PURPLE' | 'RED';

export interface WingoRoundAttributes {
  id?: number;
  roundId: number;
  serverSeedHash: string;
  serverSeed?: string | null;
  nonce: number;
  result?: WingoColor | null;
  bettingEndsAt: number;
  revealedAt?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WingoRoundCreationAttributes = Optional<WingoRoundAttributes, 'id' | 'serverSeed' | 'result' | 'revealedAt' | 'createdAt' | 'updatedAt'>;

export class WingoRound extends Model<WingoRoundAttributes, WingoRoundCreationAttributes> implements WingoRoundAttributes {
  declare id: number;
  declare roundId: number;
  declare serverSeedHash: string;
  declare serverSeed: string | null;
  declare nonce: number;
  declare result: WingoColor | null;
  declare bettingEndsAt: number;
  declare revealedAt: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWingoRoundModel(sequelize: Sequelize) {
  WingoRound.init(
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false, unique: true },
      serverSeedHash: { field: 'server_seed_hash', type: DataTypes.STRING(64), allowNull: false },
      serverSeed: { field: 'server_seed', type: DataTypes.STRING(128), allowNull: true },
      nonce: { type: DataTypes.BIGINT, allowNull: false },
      result: { type: DataTypes.ENUM('GREEN', 'PURPLE', 'RED'), allowNull: true },
      bettingEndsAt: { field: 'betting_ends_at', type: DataTypes.BIGINT, allowNull: false },
      revealedAt: { field: 'revealed_at', type: DataTypes.BIGINT, allowNull: true },
    },
    { sequelize, tableName: 'wingo_rounds', underscored: true }
  );
}
