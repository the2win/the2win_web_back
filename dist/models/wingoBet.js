import { DataTypes, Model } from 'sequelize';
export class WingoBet extends Model {
}
export function initWingoBetModel(sequelize) {
    WingoBet.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        roundId: { field: 'round_id', type: DataTypes.BIGINT, allowNull: false },
        userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
        selection: { type: DataTypes.ENUM('GREEN', 'PURPLE', 'RED'), allowNull: false },
        amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false },
    }, { sequelize, tableName: 'wingo_bets', underscored: true, indexes: [{ fields: ['round_id'] }, { fields: ['user_id', 'round_id'] }] });
}
