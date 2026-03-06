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
    if (!/^\d*\.?\d{0,2}$/.test(value)) return;
    setPartialWithdrawInputs((previous) => ({
      ...previous,
      [scheduleKey]: value,
    }));
  }, []);

  const setPartialWithdrawMax = useCallback((scheduleKey: string, value: BN, decimals: number) => {
    // Convert raw BN to a human-readable decimal string (e.g. 960000 w/ 6 decimals → "0.96")
    const amtStr = value.toString();
    const paddedStr = amtStr.padStart(decimals + 1, '0');
    const intPart = paddedStr.slice(0, -decimals) || '0';
    const fracPart = paddedStr.slice(-decimals).replace(/0+$/, ''); // trim trailing zeros
    const displayValue = fracPart
      ? `${intPart}.${fracPart.slice(0, 2)}` // cap at 2 dp
      : intPart;
    setPartialWithdrawInputs((previous) => ({
      ...previous,
      [scheduleKey]: displayValue,
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
