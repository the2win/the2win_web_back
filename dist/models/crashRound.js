import { DataTypes, Model } from 'sequelize';
export class CrashRound extends Model {
}
export function initCrashRoundModel(sequelize) {
    CrashRound.init({
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false, unique: true },
        serverSeedHash: { field: 'server_seed_hash', type: DataTypes.STRING(64), allowNull: false },
        serverSeed: { field: 'server_seed', type: DataTypes.STRING(128), allowNull: true },
        nonce: { type: DataTypes.BIGINT, allowNull: false },
        crashPoint: { field: 'crash_point', type: DataTypes.DECIMAL(10, 2), allowNull: true },
        waitingEndsAt: { field: 'waiting_ends_at', type: DataTypes.BIGINT, allowNull: false },
        lockedEndsAt: { field: 'locked_ends_at', type: DataTypes.BIGINT, allowNull: true },
        startedAt: { field: 'started_at', type: DataTypes.BIGINT, allowNull: true },
        crashedAt: { field: 'crashed_at', type: DataTypes.BIGINT, allowNull: true },
    }, { sequelize, tableName: 'crash_rounds', underscored: true });
}
