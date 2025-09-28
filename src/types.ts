export interface ApiUser { id: string; email: string; balance: number; }
export interface AuthResponse { token: string; user: ApiUser; }
export interface TransactionDto { id: string; type: string; amount: number; createdAt: number; meta?: any; }
