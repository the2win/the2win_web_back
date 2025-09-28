import { DataTypes, Model, type Sequelize, Optional } from 'sequelize';

export type OverrideGame = 'crash' | 'wingo' | 'boxes';

export interface AdminOverrideAttributes {
  id: string;
  game: OverrideGame;
  payload: any; // JSON: { crashPoint } | { color } | { indexes }
  createdBy: string; // admin user id
  createdAtMs: number;
  consumedAtMs?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AdminOverrideCreationAttributes = Optional<AdminOverrideAttributes, 'id' | 'consumedAtMs' | 'createdAtMs' | 'createdAt' | 'updatedAt'>;

export class AdminOverride extends Model<AdminOverrideAttributes, AdminOverrideCreationAttributes> implements AdminOverrideAttributes {
  declare id: string;
  declare game: OverrideGame;
  declare payload: any;
  declare createdBy: string;
  declare createdAtMs: number;
  declare consumedAtMs: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initAdminOverrideModel(sequelize: Sequelize) {
  AdminOverride.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      game: { type: DataTypes.ENUM('crash', 'wingo', 'boxes'), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      createdBy: { field: 'created_by', type: DataTypes.STRING(32), allowNull: false },
      createdAtMs: { field: 'created_at', type: DataTypes.BIGINT, allowNull: false, defaultValue: () => Date.now() },
      consumedAtMs: { field: 'consumed_at', type: DataTypes.BIGINT, allowNull: true },
    },
    { sequelize, tableName: 'admin_overrides', underscored: true, timestamps: false, indexes: [{ fields: ['game', 'created_at'] }] }
  );
}
