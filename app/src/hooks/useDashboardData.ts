import { useMemo } from 'react';
import { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';
import { DECIMAL_MULTIPLIER, ZERO } from '../dashboard/constants';
import type { DashboardStats, DecoratedSchedule, ScheduleTab, VestingSchedule } from '../dashboard/types';
import {
  calculateNextUnlock,
  calculateTimePercent,
  calculateVestedAmount,
} from '../dashboard/utils';

interface UseDashboardDataProps {
  schedules: VestingSchedule[];
  now: BN;
  publicKey: PublicKey | null;
  activeTab: ScheduleTab;
  searchTerm: string;
}

export function useDashboardData({ schedules, now, publicKey, activeTab, searchTerm }: UseDashboardDataProps) {
  const decoratedSchedules = useMemo<DecoratedSchedule[]>(() => {
    if (!publicKey) return [];

    const currentWallet = publicKey.toString();
    return schedules.map((schedule) => {
      const account = schedule.account;
      const isBeneficiary = account.beneficiary.toString() === currentWallet;
      const isGrantor = account.grantor.toString() === currentWallet;
      const vested = calculateVestedAmount(account, now);
      const claimable = vested.gt(account.totalWithdrawn) ? vested.sub(account.totalWithdrawn) : ZERO;
      const claimableRaw = claimable.div(DECIMAL_MULTIPLIER);

      return {
        ...schedule,
        isBeneficiary,
        isGrantor,
        claimable,
        claimableRaw,
        vested,
        counterparty: isBeneficiary ? account.grantor : account.beneficiary,
        isCompleted: account.totalWithdrawn.gte(account.totalAmount),
        withdrawnPercent: account.totalAmount.lte(ZERO)
          ? 0
          : Number(account.totalWithdrawn.muln(10_000).div(account.totalAmount).toString()) / 100,
        timePercent: calculateTimePercent(account, now),
        nextUnlock: calculateNextUnlock(account, now),
        decimals: ((account as unknown as Record<string, unknown>).decimals as number | undefined) ?? 9,
        mintName: (account as unknown as Record<string, unknown>).mintName as string | undefined,
        mintLogoUrl: (account as unknown as Record<string, unknown>).mintLogoUrl as string | undefined,
      };
    });
  }, [now, publicKey, schedules]);

  const stats = useMemo<DashboardStats>(() => {
    let totalAllocatedToBeneficiary = new BN(0);
    let totalClaimable = new BN(0);
    let activeCount = 0;
    let revokedCount = 0;
    let receivingCount = 0;
    let grantingCount = 0;
    let readyToClaimCount = 0;

    for (const schedule of decoratedSchedules) {
      if (schedule.account.isActive) {
        activeCount += 1;
      } else {
        revokedCount += 1;
      }

      if (schedule.isBeneficiary) {
        receivingCount += 1;
        totalAllocatedToBeneficiary = totalAllocatedToBeneficiary.add(schedule.account.totalAmount);
        totalClaimable = totalClaimable.add(schedule.claimable);
        if (schedule.claimable.gt(ZERO)) {
          readyToClaimCount += 1;
        }
      }

      if (schedule.isGrantor) {
        grantingCount += 1;
      }
    }

    return {
      totalSchedules: decoratedSchedules.length,
      totalAllocatedToBeneficiary,
      totalClaimable,
      activeCount,
      revokedCount,
      receivingCount,
      grantingCount,
      readyToClaimCount,
    };
  }, [decoratedSchedules]);

  const filteredSchedules = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return decoratedSchedules.filter((schedule) => {
      if (activeTab === 'receiving' && !schedule.isBeneficiary) return false;
      if (activeTab === 'granting' && !schedule.isGrantor) return false;
      if (activeTab === 'inactive' && schedule.account.isActive) return false;
      if (activeTab === 'claimable' && (!schedule.isBeneficiary || schedule.claimable.lte(ZERO))) {
        return false;
      }

      if (!query) return true;

      const searchableValues = [
        schedule.publicKey.toString(),
        schedule.account.grantor.toString(),
        schedule.account.beneficiary.toString(),
        schedule.account.tokenMint.toString(),
      ];

      return searchableValues.some((value) => value.toLowerCase().includes(query));
    });
  }, [activeTab, decoratedSchedules, searchTerm]);

  return {
    decoratedSchedules,
    stats,
    filteredSchedules,
  };
}
