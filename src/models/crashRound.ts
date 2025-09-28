import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export interface CrashRoundAttributes {
  id?: number; // auto
  roundId: number;
  serverSeedHash: string;
  serverSeed?: string | null;
  nonce: number;
  crashPoint?: number | null;
  waitingEndsAt: number;
  lockedEndsAt?: number | null;
  startedAt?: number | null;
  crashedAt?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CrashRoundCreationAttributes = Optional<CrashRoundAttributes, 'id' | 'serverSeed' | 'crashPoint' | 'lockedEndsAt' | 'startedAt' | 'crashedAt' | 'createdAt' | 'updatedAt'>;

export class CrashRound extends Model<CrashRoundAttributes, CrashRoundCreationAttributes> implements CrashRoundAttributes {
  declare id: number;
  declare roundId: number;
  declare serverSeedHash: string;
  declare serverSeed: string | null;
  declare nonce: number;
  declare crashPoint: number | null;
  declare waitingEndsAt: number;
  declare lockedEndsAt: number | null;
  declare startedAt: number | null;
  declare crashedAt: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCrashRoundModel(sequelize: Sequelize) {
  CrashRound.init(
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false, unique: true },
      serverSeedHash: { field: 'server_seed_hash', type: DataTypes.STRING(64), allowNull: false },
      serverSeed: { field: 'server_seed', type: DataTypes.STRING(128), allowNull: true },
      nonce: { type: DataTypes.BIGINT, allowNull: false },
      crashPoint: { field: 'crash_point', type: DataTypes.DECIMAL(10,2), allowNull: true },
      waitingEndsAt: { field: 'waiting_ends_at', type: DataTypes.BIGINT, allowNull: false },
      lockedEndsAt: { field: 'locked_ends_at', type: DataTypes.BIGINT, allowNull: true },
      startedAt: { field: 'started_at', type: DataTypes.BIGINT, allowNull: true },
      crashedAt: { field: 'crashed_at', type: DataTypes.BIGINT, allowNull: true },
    },
    { sequelize, tableName: 'crash_rounds', underscored: true }
  );
}
