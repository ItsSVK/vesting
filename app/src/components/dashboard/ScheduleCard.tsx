import { BN } from '@coral-xyz/anchor';
import { ArrowDownToLine, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { formatDate, formatTokenAmount } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import type { DecoratedSchedule } from '../../dashboard/types';
import { parseWholeTokenAmount, formatRelativeFromNow, shortenAddress } from '../../dashboard/utils';
import { ZERO } from '../../dashboard/constants';


interface ScheduleCardProps {
  schedule: DecoratedSchedule;
  nowUnix: number;
  partialInput: string;
  onPartialInputChange: (value: string) => void;
  onPartialMax: () => void;
  processingActionKey: string | null;
  claimingAll: boolean;
  onClaim: (schedule: DecoratedSchedule, requestedRawAmount?: BN) => void;
  onRevoke: (schedule: DecoratedSchedule) => void;
  onClose: (schedule: DecoratedSchedule) => void;
}

export function ScheduleCard({
  schedule,
  nowUnix,
  partialInput,
  onPartialInputChange,
  onPartialMax,
  processingActionKey,
  claimingAll,
  onClaim,
  onRevoke,
  onClose,
}: ScheduleCardProps) {
  const scheduleKey = schedule.publicKey.toString();
  const parsedPartialAmount = parseWholeTokenAmount(partialInput);
  const hasPartialInput = partialInput.trim().length > 0;
  const partialExceedsClaimable = parsedPartialAmount !== null && parsedPartialAmount.gt(schedule.claimableRaw);
  const partialReady =
    parsedPartialAmount !== null && parsedPartialAmount.gt(ZERO) && parsedPartialAmount.lte(schedule.claimableRaw);

  const claimActionKey = `claim:${scheduleKey}`;
  const revokeActionKey = `revoke:${scheduleKey}`;
  const closeActionKey = `close:${scheduleKey}`;
  const isClaimingSchedule = processingActionKey === claimActionKey;
  const isRevokingSchedule = processingActionKey === revokeActionKey;
  const isClosingSchedule = processingActionKey === closeActionKey;
  const actionLocked = claimingAll || isClaimingSchedule || isRevokingSchedule || isClosingSchedule;

  const formatDynamicRelativeTime = (unixTime: BN, type: 'start' | 'cliff' | 'end', isActive: boolean) => {

    if (!isActive) {
      return 'Revoked';
    }

    const diffInSeconds = Math.floor(unixTime.toNumber() - nowUnix);
    const isPast = diffInSeconds <= 0;
    
    if (isPast) {
      if (type === 'start') return 'Started';
      if (type === 'cliff') return 'Cliff passed';
      if (type === 'end') return 'Ended';
    }

    const absDiff = Math.abs(diffInSeconds);

    const days = Math.floor(absDiff / 86400);
    const hours = Math.floor((absDiff % 86400) / 3600);
    const minutes = Math.floor((absDiff % 3600) / 60);
    const seconds = absDiff % 60;

    let timeString = '';
    if (days > 0) timeString += `${days}d `;
    if (hours > 0 || days > 0) timeString += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) timeString += `${minutes}m `;
    timeString += `${seconds}s`;

    return `in ${timeString}`;
  };

  return (
    <div className="group overflow-hidden rounded-2xl border-black/5 bg-white/80 shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/3">
      <div className="p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={schedule.account.isActive ? 'secondary' : 'outline'}
                className={cn(
                  schedule.account.isActive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300',
                )}
              >
                {schedule.account.isActive ? 'Active' : 'Revoked'}
              </Badge>
              {schedule.isBeneficiary && <Badge variant="outline">Beneficiary</Badge>}
              {schedule.isGrantor && <Badge variant="outline">Grantor</Badge>}
              {schedule.isCompleted && (
                <Badge
                  variant="outline"
                  className="border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300"
                >
                  Fully Withdrawn
                </Badge>
              )}
            </div>

            <div>
              <h3 className="text-lg font-medium tracking-tight">
                {schedule.isBeneficiary ? 'Incoming Vesting Stream' : 'Outgoing Vesting Stream'}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vesting State: {shortenAddress(schedule.publicKey)} • Mint: {shortenAddress(schedule.account.tokenMint)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Counterparty: {shortenAddress(schedule.counterparty)}</p>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-black/3 p-2.5 dark:bg-white/3 flex flex-col justify-between">
                <p className="text-muted-foreground">Start</p>
                <div>
                  <p className="mt-1 font-medium">{formatDate(schedule.account.startTime)}</p>
                  <p className={`mt-0.5 text-[10px] ${schedule.account.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} font-medium`}>
                    {formatDynamicRelativeTime(schedule.account.startTime, 'start', schedule.account.isActive)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-black/3 p-2.5 dark:bg-white/3 flex flex-col justify-between">
                <p className="text-muted-foreground">Cliff</p>
                <div>
                  <p className="mt-1 font-medium">{formatDate(schedule.account.cliffTime)}</p>
                  <p className={`mt-0.5 text-[10px] ${schedule.account.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} font-medium`}>
                    {formatDynamicRelativeTime(schedule.account.cliffTime, 'cliff', schedule.account.isActive)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-black/3 p-2.5 dark:bg-white/3 flex flex-col justify-between">
                <p className="text-muted-foreground">End</p>
                <div>
                  <p className="mt-1 font-medium">{formatDate(schedule.account.vestingEndTime)}</p>
                  <p className={`mt-0.5 text-[10px] ${schedule.account.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} font-medium`}>
                    {formatDynamicRelativeTime(schedule.account.vestingEndTime, 'end', schedule.account.isActive)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-black/5 bg-white/70 p-3 dark:border-white/10 dark:bg-white/3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Withdrawn Progress</span>
                  <span className="font-medium">{schedule.withdrawnPercent.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-neutral-900 to-neutral-500 transition-all duration-700 dark:from-white dark:to-neutral-400"
                    style={{ width: `${schedule.withdrawnPercent}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Timeline Progress</span>
                  <span className="font-medium">{schedule.timePercent.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-sky-600 to-emerald-500 transition-all duration-700"
                    style={{ width: `${schedule.timePercent}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Next unlock:{' '}
                {schedule.nextUnlock
                  ? `${formatDate(schedule.nextUnlock)} (${formatRelativeFromNow(schedule.nextUnlock)})`
                  : 'No upcoming unlock'}
              </p>
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-2xl border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-white/3">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold tracking-tight">{formatTokenAmount(schedule.account.totalAmount)}</p>
              </div>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Withdrawn</span>
                  <span className="font-medium">{formatTokenAmount(schedule.account.totalWithdrawn)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Vested</span>
                  <span className="font-medium">{formatTokenAmount(schedule.vested)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Claimable</span>
                  <span
                    className={cn(
                      'font-semibold',
                      schedule.claimable.gt(ZERO) && 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {formatTokenAmount(schedule.claimable)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {schedule.isBeneficiary && (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={partialInput}
                      onChange={(event) => onPartialInputChange(event.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Partial amount"
                      className="h-10 rounded-xl border-black/10 bg-white/80 text-sm dark:border-white/15 dark:bg-white/3"
                      disabled={actionLocked}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-black/10 dark:border-white/15"
                      disabled={actionLocked || schedule.claimableRaw.lte(ZERO)}
                      onClick={onPartialMax}
                    >
                      Max
                    </Button>
                  </div>
                  {hasPartialInput && parsedPartialAmount === null && (
                    <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">Enter whole numbers only.</p>
                  )}
                  {partialExceedsClaimable && (
                    <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                      Amount exceeds current claimable balance.
                    </p>
                  )}
                  <Button
                    className="h-10 rounded-xl"
                    disabled={actionLocked || !partialReady}
                    onClick={() => {
                      if (parsedPartialAmount !== null) {
                        onClaim(schedule, parsedPartialAmount);
                      }
                    }}
                  >
                    {isClaimingSchedule ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
                    {isClaimingSchedule ? 'Withdrawing...' : 'Withdraw Partial'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/3"
                    disabled={actionLocked || schedule.claimableRaw.lte(ZERO)}
                    onClick={() => onClaim(schedule)}
                  >
                    <ArrowDownToLine className="size-4" />
                    Withdraw Max
                  </Button>
                </>
              )}

              {schedule.isGrantor && schedule.account.isActive && schedule.timePercent < 100 && (
                <Button variant="destructive" className="h-10 rounded-xl" disabled={actionLocked} onClick={() => onRevoke(schedule)}>
                  {isRevokingSchedule ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                  {isRevokingSchedule ? 'Revoking...' : 'Revoke Schedule'}
                </Button>
              )}

              {schedule.isGrantor && (!schedule.account.isActive || schedule.timePercent === 100) && (
                <div className="group/tooltip relative">
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-xl border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/3 disabled:pointer-events-auto disabled:opacity-70 disabled:bg-neutral-100/50 disabled:text-neutral-600 dark:disabled:bg-neutral-800/50 dark:disabled:text-neutral-300"
                    disabled={actionLocked || schedule.claimableRaw.gt(ZERO)}
                    onClick={() => {
                       if (schedule.claimableRaw.lte(ZERO)) onClose(schedule);
                    }}
                  >
                    {isClosingSchedule ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                    {isClosingSchedule ? 'Closing...' : 'Close Vault'}
                  </Button>
                  
                  {/* Custom Tooltip on Hover */}
                  {schedule.claimableRaw.gt(ZERO) && (
                    <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-white opacity-0 transition-opacity duration-200 group-hover/tooltip:opacity-100 dark:bg-neutral-100 dark:text-neutral-900 z-50">
                      Beneficiary hasn't claimed yet
                      {/* Tooltip Arrow */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800 dark:border-t-neutral-100"></div>
                    </div>
                  )}
                </div>
              )}

              {schedule.isBeneficiary && schedule.claimableRaw.lte(ZERO) && schedule.claimable.gt(ZERO) && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Program accepts whole token units in `withdraw(amount)`, then applies mint decimals on-chain.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
