import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';
import { useVestingSchedules } from './useVestingSchedules';
import { useWorkspace } from './useWorkspace';
import type { DashboardStats, DecoratedSchedule, ScheduleTab, VestingSchedule } from '../dashboard/types';

import { useDashboardState } from './useDashboardState';
import { useDashboardData } from './useDashboardData';
import { useVestingActions } from './useVestingActions';

export interface VestingDashboardController {
  connected: boolean;
  publicKey: ReturnType<typeof useWallet>['publicKey'];
  activeTab: ScheduleTab;
  setActiveTab: (value: ScheduleTab) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  processingActionKey: string | null;
  claimingAll: boolean;
  isLoading: boolean;
  isFetching: boolean;
  scrollY: number;
  nowUnix: number;
  stats: DashboardStats;
  filteredSchedules: DecoratedSchedule[];
  partialWithdrawInputs: Record<string, string>;
  updatePartialWithdrawInput: (scheduleKey: string, value: string) => void;
  setPartialWithdrawMax: (scheduleKey: string, value: BN, decimals: number) => void;
  clearSearch: () => void;
  refetch: () => Promise<unknown>;
  handleClaim: (schedule: DecoratedSchedule, requestedRawAmount?: BN) => Promise<void>;
  handleRevoke: (schedule: DecoratedSchedule) => Promise<void>;
  handleClose: (schedule: DecoratedSchedule) => Promise<void>;
  handleClaimAll: () => Promise<void>;
}

export function useVestingDashboard(): VestingDashboardController {
  const { connected, publicKey } = useWallet();
  const { program } = useWorkspace();
  const { data: fetchedSchedules = [], isLoading, isFetching, refetch } = useVestingSchedules();

  const state = useDashboardState();
  
  const schedules = useMemo(() => fetchedSchedules as VestingSchedule[], [fetchedSchedules]);
  const now = useMemo(() => new BN(state.nowUnix), [state.nowUnix]);

  const data = useDashboardData({
    schedules,
    now,
    publicKey,
    activeTab: state.activeTab,
    searchTerm: state.searchTerm,
  });

  const actions = useVestingActions({
    program,
    publicKey,
    refetch,
    setProcessingActionKey: state.setProcessingActionKey,
    setPartialWithdrawInputs: state.setPartialWithdrawInputs,
    decoratedSchedules: data.decoratedSchedules,
    setClaimingAll: state.setClaimingAll,
  });

  return {
    connected,
    publicKey,
    isLoading,
    isFetching,
    refetch,
    
    // UI State
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,
    searchTerm: state.searchTerm,
    setSearchTerm: state.setSearchTerm,
    processingActionKey: state.processingActionKey,
    claimingAll: state.claimingAll,
    scrollY: state.scrollY,
    nowUnix: state.nowUnix,
    partialWithdrawInputs: state.partialWithdrawInputs,
    updatePartialWithdrawInput: state.updatePartialWithdrawInput,
    setPartialWithdrawMax: state.setPartialWithdrawMax,
    clearSearch: state.clearSearch,

    // Data
    stats: data.stats,
    filteredSchedules: data.filteredSchedules,

    // Actions
    handleClaim: actions.handleClaim,
    handleRevoke: actions.handleRevoke,
    handleClose: actions.handleClose,
    handleClaimAll: actions.handleClaimAll,
  };
}
