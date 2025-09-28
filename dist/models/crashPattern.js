import { DataTypes, Model } from 'sequelize';
export class CrashPattern extends Model {
}
export function initCrashPatternModel(sequelize) {
    CrashPattern.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
        sequence: { type: DataTypes.JSON, allowNull: false },
        currentIndex: { field: 'current_index', type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    }, { sequelize, tableName: 'crash_patterns', underscored: true, indexes: [{ fields: ['active'] }] });
}
