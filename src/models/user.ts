import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export interface UserAttributes {
  id: string;
  email: string;
  passwordHash: string;
  role?: 'user' | 'admin';
  balance: number;
  otpCode?: string | null;
  otpExpiresAt?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'role' | 'balance' | 'otpCode' | 'otpExpiresAt' | 'createdAt' | 'updatedAt'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare passwordHash: string;
  declare role: 'user' | 'admin';
  declare balance: number;
  declare otpCode: string | null;
  declare otpExpiresAt: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initUserModel(sequelize: Sequelize) {
  User.init(
    {
      id: { type: DataTypes.STRING(32), primaryKey: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      passwordHash: { field: 'password_hash', type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('user','admin'), allowNull: false, defaultValue: 'user' },
      balance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      otpCode: { field: 'otp_code', type: DataTypes.STRING(12), allowNull: true },
      otpExpiresAt: { field: 'otp_expires_at', type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      tableName: 'users',
      underscored: true,
    }
  );
}
