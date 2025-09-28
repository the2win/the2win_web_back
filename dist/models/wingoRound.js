import { DataTypes, Model } from 'sequelize';
export class WingoRound extends Model {
}
export function initWingoRoundModel(sequelize) {
    WingoRound.init({
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false, unique: true },
        serverSeedHash: { field: 'server_seed_hash', type: DataTypes.STRING(64), allowNull: false },
        serverSeed: { field: 'server_seed', type: DataTypes.STRING(128), allowNull: true },
        nonce: { type: DataTypes.BIGINT, allowNull: false },
        result: { type: DataTypes.ENUM('GREEN', 'PURPLE', 'RED'), allowNull: true },
        bettingEndsAt: { field: 'betting_ends_at', type: DataTypes.BIGINT, allowNull: false },
        revealedAt: { field: 'revealed_at', type: DataTypes.BIGINT, allowNull: true },
    }, { sequelize, tableName: 'wingo_rounds', underscored: true });
}
