import { DataTypes, Model } from 'sequelize';
export class BankAccount extends Model {
}
export function initBankAccountModel(sequelize) {
    BankAccount.init({
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        userId: { field: 'user_id', type: DataTypes.STRING(32), allowNull: false },
        bankName: { field: 'bank_name', type: DataTypes.STRING(120), allowNull: false },
        accountNumber: { field: 'account_number', type: DataTypes.STRING(64), allowNull: false },
        accountHolder: { field: 'account_holder', type: DataTypes.STRING(120), allowNull: false },
        isDefault: { field: 'is_default', type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    }, { sequelize, tableName: 'bank_accounts', underscored: true, timestamps: false, indexes: [{ fields: ['user_id'] }] });
}
