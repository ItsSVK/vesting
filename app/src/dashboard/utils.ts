import { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';
import type { VestingAccount } from './types';
import { ZERO } from './constants';

const VESTING_ERROR_MESSAGES: Record<number, string> = {
  6000: 'Cannot close the vesting account while vault balance is not zero.',
  6001: 'Amount must be greater than zero.',
  6002: 'Vesting duration must be greater than zero.',
  6003: 'Invalid cliff time.',
  6004: 'Cliff duration must be less than vesting duration.',
  6005: 'Grantor and beneficiary must be different wallets.',
  6006: 'Requested amount exceeds currently withdrawable balance.',
  6007: 'Invalid start time.',
  6008: 'Cliff has not passed yet. Tokens are still locked.',
  6009: 'This vesting schedule is no longer active.',
  6010: 'Frequency must be greater than zero.',
  6011: 'Cliff duration must be greater than zero.',
  6012: 'Frequency cannot exceed vesting duration.',
  6013: 'A vesting schedule already exists for this grantor, beneficiary, and mint.',
};

interface AnchorLikeError {
  error?: {
    errorCode?: {
      number?: number;
    };
    errorMessage?: string;
  };
  errorCode?: {
    number?: number;
  };
  logs?: string[];
  message?: string;
}

function extractProgramErrorCode(error: AnchorLikeError): number | undefined {
  if (typeof error.error?.errorCode?.number === 'number') {
    return error.error.errorCode.number;
  }

  if (typeof error.errorCode?.number === 'number') {
    return error.errorCode.number;
  }

  const logSources: string[][] = [];
  if (Array.isArray(error.logs)) {
    logSources.push(error.logs);
  }
  const nestedLogs = (error.error as { logs?: string[] } | undefined)?.logs;
  if (Array.isArray(nestedLogs)) {
    logSources.push(nestedLogs);
  }

  const logLines = logSources.flat();
  for (const line of logLines) {
    const hexMatch = line.match(/custom program error: (0x[0-9a-fA-F]+)/);
    if (hexMatch?.[1]) {
      return Number.parseInt(hexMatch[1], 16);
    }
    const decMatch = line.match(/custom program error: ([0-9]+)/);
    if (decMatch?.[1]) {
      return Number.parseInt(decMatch[1], 10);
    }
  }

  return undefined;
}

export function shortenAddress(address: PublicKey | string, visible = 4): string {
  const value = typeof address === 'string' ? address : address.toString();
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function parseErrorMessage(error: unknown): string {
  const anchorError = error as AnchorLikeError;
  const errorCode = extractProgramErrorCode(anchorError);

  if (typeof errorCode === 'number' && VESTING_ERROR_MESSAGES[errorCode]) {
    return VESTING_ERROR_MESSAGES[errorCode];
  }

  if (typeof anchorError.error?.errorMessage === 'string' && anchorError.error.errorMessage.length > 0) {
    return anchorError.error.errorMessage;
  }

  if (error instanceof Error && error.message.length > 0) {
    if (error.message.includes('already in use')) {
      return 'A vesting schedule already exists for this grantor, beneficiary, and mint.';
    }
    if (error.message.includes('0x0')) {
      return 'Transaction failed due to an unknown program error.';
    }
    return error.message;
  }

  return 'Unknown error occurred.';
}

export function bnPercent(part: BN, total: BN): number {
  if (total.lte(ZERO)) return 0;
  const basisPoints = part.muln(10_000).div(total);
  const percent = Number(basisPoints.toString()) / 100;
  return Math.min(100, Math.max(0, percent));
}

export function calculateVestedAmount(account: VestingAccount, now: BN): BN {
  if (!account.isActive) return account.totalAmount;
  if (now.lt(account.cliffTime)) return ZERO;
  if (account.frequency.lte(ZERO)) return account.totalAmount;

  const totalDuration = account.vestingEndTime.sub(account.startTime);
  if (totalDuration.lte(ZERO)) return account.totalAmount;

  const totalPeriods = totalDuration.div(account.frequency);
  if (totalPeriods.lte(ZERO)) return account.totalAmount;

  const tokensPerPeriod = account.totalAmount.div(totalPeriods);
  const timeElapsed = now.sub(account.cliffTime);
  const completedPeriods = timeElapsed.div(account.frequency);
  const vested = completedPeriods.mul(tokensPerPeriod);

  return vested.gt(account.totalAmount) ? account.totalAmount : vested;
}

export function calculateTimePercent(account: VestingAccount, now: BN): number {
  const totalDuration = account.vestingEndTime.sub(account.startTime);
  if (totalDuration.lte(ZERO)) return account.isActive ? 0 : 100;
  if (now.lte(account.startTime)) return 0;
  if (now.gte(account.vestingEndTime)) return 100;
  return bnPercent(now.sub(account.startTime), totalDuration);
}

export function calculateNextUnlock(account: VestingAccount, now: BN): BN | null {
  if (!account.isActive) return null;
  if (account.frequency.lte(ZERO)) return null;
  if (now.gte(account.vestingEndTime)) return null;
  if (now.lt(account.cliffTime)) return account.cliffTime;

  const completedPeriods = now.sub(account.cliffTime).div(account.frequency);
  const nextPeriodOffset = completedPeriods.addn(1).mul(account.frequency);
  const nextUnlock = account.cliffTime.add(nextPeriodOffset);
  return nextUnlock.gt(account.vestingEndTime) ? account.vestingEndTime : nextUnlock;
}

export function formatRelativeFromNow(unixTime: BN): string {
  const secondsLeft = unixTime.toNumber() - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return 'now';

  const days = Math.floor(secondsLeft / 86_400);
  if (days > 0) return `in ${days}d`;

  const hours = Math.floor(secondsLeft / 3_600);
  if (hours > 0) return `in ${hours}h`;

  const minutes = Math.floor(secondsLeft / 60);
  if (minutes > 0) return `in ${minutes}m`;

  return `in ${secondsLeft}s`;
}

export function parseWholeTokenAmount(value: string): BN | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  try {
    return new BN(normalized);
  } catch {
    return null;
  }
}
