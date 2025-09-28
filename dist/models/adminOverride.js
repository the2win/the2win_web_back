import { DataTypes, Model } from 'sequelize';
export class AdminOverride extends Model {
}
export function initAdminOverrideModel(sequelize) {
    AdminOverride.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        game: { type: DataTypes.ENUM('crash', 'wingo', 'boxes'), allowNull: false },
        payload: { type: DataTypes.JSON, allowNull: false },
        createdBy: { field: 'created_by', type: DataTypes.STRING(32), allowNull: false },
        createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false, defaultValue: () => Date.now() },
        consumedAtMs: { field: 'consumed_at', type: DataTypes.BIGINT, allowNull: true },
    }, { sequelize, tableName: 'admin_overrides', underscored: true, timestamps: false, indexes: [{ fields: ['game', 'created_at'] }] });
}
