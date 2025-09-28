import { DataTypes, Model } from 'sequelize';
export class User extends Model {
}
export function initUserModel(sequelize) {
    User.init({
        id: { type: DataTypes.STRING(32), primaryKey: true },
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        passwordHash: { field: 'password_hash', type: DataTypes.STRING(255), allowNull: false },
        role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
        balance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        otpCode: { field: 'otp_code', type: DataTypes.STRING(12), allowNull: true },
        otpExpiresAt: { field: 'otp_expires_at', type: DataTypes.BIGINT, allowNull: true },
    }, {
        sequelize,
        tableName: 'users',
        underscored: true,
    });
}
