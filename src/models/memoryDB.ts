export interface User {
  id: string;
  email: string;
  passwordHash: string;
  otp?: { code: string; expiresAt: number };
  balance: number; // game coins
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'BET' | 'WIN';
  amount: number;
  createdAt: number;
  meta?: any;
}

export const db = {
  users: [] as User[],
  transactions: [] as Transaction[],
};
