import { DataTypes, Model } from 'sequelize';
export class CrashBet extends Model {
}
export function initCrashBetModel(sequelize) {
    CrashBet.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false },
        userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
        amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        cashedOut: { field: 'cashed_out', type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        cashoutMultiplier: { field: 'cashout_multiplier', type: DataTypes.DECIMAL(10, 2), allowNull: true },
        createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false },
        cashedOutAt: { field: 'cashed_out_at', type: DataTypes.BIGINT, allowNull: true },
    }, { sequelize, tableName: 'crash_bets', underscored: true, indexes: [{ fields: ['round_id'] }, { fields: ['user_id', 'round_id'] }] });
}
