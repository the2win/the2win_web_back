import type { Sequelize } from 'sequelize';
import { initUserModel, User } from './user.js';
import { initTransactionModel, Transaction } from './transaction.js';
import { initCrashRoundModel, CrashRound } from './crashRound.js';
import { initCrashBetModel, CrashBet } from './crashBet.js';
import { initWingoRoundModel, WingoRound } from './wingoRound.js';
import { initWingoBetModel, WingoBet } from './wingoBet.js';
import { initAdminOverrideModel, AdminOverride } from './adminOverride.js';
import { initCrashPatternModel, CrashPattern } from './crashPattern.js';
import { initDepositRequestModel, DepositRequest } from './depositRequest.js';
import { initWithdrawRequestModel, WithdrawRequest } from './withdrawRequest.js';
import { initBankAccountModel, BankAccount } from './bankAccount.js';

export function registerModels(sequelize: Sequelize) {
  initUserModel(sequelize);
  initTransactionModel(sequelize);
  initCrashRoundModel(sequelize);
  initCrashBetModel(sequelize);
  initWingoRoundModel(sequelize);
  initWingoBetModel(sequelize);
  initAdminOverrideModel(sequelize);
  initDepositRequestModel(sequelize);
  initWithdrawRequestModel(sequelize);
  initCrashPatternModel(sequelize);
  initBankAccountModel(sequelize);

  // Associations
  Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
  User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions', constraints: false });

  CrashBet.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
  CrashBet.belongsTo(CrashRound, { foreignKey: 'roundId', as: 'round' });
  CrashRound.hasMany(CrashBet, { foreignKey: 'roundId', as: 'bets' });

  WingoBet.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
  WingoBet.belongsTo(WingoRound, { foreignKey: 'roundId', as: 'round' });
  WingoRound.hasMany(WingoBet, { foreignKey: 'roundId', as: 'bets' });

  DepositRequest.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
  WithdrawRequest.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
  BankAccount.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
}

export { User, Transaction, CrashRound, CrashBet, WingoRound, WingoBet, AdminOverride, DepositRequest, WithdrawRequest, CrashPattern, BankAccount };
