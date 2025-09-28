import { DataTypes, Model } from 'sequelize';
export class Transaction extends Model {
}
export function initTransactionModel(sequelize) {
    Transaction.init({
        id: { type: DataTypes.STRING(36), primaryKey: true },
        userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
        type: { type: DataTypes.ENUM('DEPOSIT', 'WITHDRAW', 'BET', 'WIN'), allowNull: false },
        amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        // Map to TIMESTAMP/DATETIME in DB; let DB default set the value when omitted
        createdAt: { field: 'created_at', type: DataTypes.DATE, allowNull: true },
        meta: { type: DataTypes.JSON, allowNull: true },
    }, {
        sequelize,
        tableName: 'transactions',
        underscored: true,
        indexes: [{ fields: ['user_id', 'created_at'] }],
    });
}
