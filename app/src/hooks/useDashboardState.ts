import { useState, useEffect, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import type { ScheduleTab } from '../dashboard/types';

export function useDashboardState() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [partialWithdrawInputs, setPartialWithdrawInputs] = useState<Record<string, string>>({});
  const [processingActionKey, setProcessingActionKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const updatePartialWithdrawInput = useCallback((scheduleKey: string, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setPartialWithdrawInputs((previous) => ({
      ...previous,
      [scheduleKey]: value,
    }));
  }, []);

  const setPartialWithdrawMax = useCallback((scheduleKey: string, value: BN) => {
    setPartialWithdrawInputs((previous) => ({
      ...previous,
      [scheduleKey]: value.toString(),
    }));
  }, []);

  const clearSearch = useCallback(() => setSearchTerm(''), []);

  return {
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    partialWithdrawInputs,
    setPartialWithdrawInputs,
    processingActionKey,
    setProcessingActionKey,
    claimingAll,
    setClaimingAll,
    nowUnix,
    scrollY,
    updatePartialWithdrawInput,
    setPartialWithdrawMax,
    clearSearch,
  };
}
