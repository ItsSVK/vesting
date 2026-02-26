import { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

export type ScheduleTab = 'all' | 'receiving' | 'granting' | 'inactive' | 'claimable';

export interface VestingAccount {
  grantor: PublicKey;
  beneficiary: PublicKey;
  startTime: BN;
  cliffTime: BN;
  vestingEndTime: BN;
  totalAmount: BN;
  totalWithdrawn: BN;
  tokenMint: PublicKey;
  isActive: boolean;
  revokedAt: BN;
  frequency: BN;
}

export interface VestingSchedule {
  publicKey: PublicKey;
  account: VestingAccount;
}

export interface DecoratedSchedule extends VestingSchedule {
  isBeneficiary: boolean;
  isGrantor: boolean;
  claimable: BN;
  claimableRaw: BN;
  vested: BN;
  counterparty: PublicKey;
  isCompleted: boolean;
  withdrawnPercent: number;
  timePercent: number;
  nextUnlock: BN | null;
}

export interface DashboardStats {
  totalSchedules: number;
  totalAllocatedToBeneficiary: BN;
  totalClaimable: BN;
  activeCount: number;
  revokedCount: number;
  receivingCount: number;
  grantingCount: number;
  readyToClaimCount: number;
}
