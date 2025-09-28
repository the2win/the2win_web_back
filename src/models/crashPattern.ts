import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface CrashPatternAttributes {
  id: string;
  name: string;
  sequence: number[]; // array of multipliers
  currentIndex: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CrashPatternCreationAttributes = Optional<CrashPatternAttributes, 'id' | 'currentIndex' | 'active' | 'createdAt' | 'updatedAt'>;

export class CrashPattern extends Model<CrashPatternAttributes, CrashPatternCreationAttributes> implements CrashPatternAttributes {
  declare id: string;
  declare name: string;
  declare sequence: number[];
  declare currentIndex: number;
  declare active: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCrashPatternModel(sequelize: Sequelize) {
  CrashPattern.init(
    {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      sequence: { type: DataTypes.JSON, allowNull: false },
      currentIndex: { field: 'current_index', type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    },
    { sequelize, tableName: 'crash_patterns', underscored: true, indexes: [{ fields: ['active'] }] }
  );
}
