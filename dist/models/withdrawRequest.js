import { DataTypes, Model } from 'sequelize';
export class WithdrawRequest extends Model {
}
export function initWithdrawRequestModel(sequelize) {
    WithdrawRequest.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
        amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        method: { type: DataTypes.STRING(32), allowNull: false },
        dest: { type: DataTypes.STRING(255), allowNull: true },
        status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
        createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false, defaultValue: () => Date.now() },
        reviewedAtMs: { field: 'reviewed_at', type: DataTypes.BIGINT, allowNull: true },
        reviewedBy: { field: 'reviewed_by', type: DataTypes.STRING(32), allowNull: true },
    }, { sequelize, tableName: 'withdraw_requests', underscored: true, timestamps: false, indexes: [{ fields: ['user_id', 'created_at'] }, { fields: ['status', 'created_at'] }] });
}
