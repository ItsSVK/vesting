import { BN } from '@coral-xyz/anchor';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import type { DecoratedSchedule, ScheduleTab } from '../../dashboard/types';
import { RevealSection } from './RevealSection';
import { ScheduleCard } from './ScheduleCard';
import { useVestingContext } from '../../context/VestingDashboardContext';

export function SchedulesPanel() {
  const {
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    clearSearch,
    stats,
    isLoading,
    isFetching,
    nowUnix,
    filteredSchedules,
    processingActionKey,
    claimingAll,
    partialWithdrawInputs,
    updatePartialWithdrawInput,
    setPartialWithdrawMax,
    handleClaim,
    handleRevoke,
    handleClose,
    refetch,
  } = useVestingContext();

  return (
    <Card className="rounded-[1.6rem] border-black/5 bg-white/78 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/3">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Schedules</CardTitle>
            <CardDescription>{isFetching ? 'Syncing latest state...' : `${filteredSchedules.length} schedule(s) shown`}</CardDescription>
          </div>
          <div className="w-full sm:w-80">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by schedule, wallet, or mint"
              className="h-11 rounded-xl border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/3"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ScheduleTab)}>
          <TabsList className="h-auto w-full flex-wrap gap-1 rounded-xl bg-black/3 p-1 dark:bg-white/6">
            <TabsTrigger value="all">All ({stats.totalSchedules})</TabsTrigger>
            <TabsTrigger value="receiving">Receiving ({stats.receivingCount})</TabsTrigger>
            <TabsTrigger value="granting">Granting ({stats.grantingCount})</TabsTrigger>
            <TabsTrigger value="inactive">Inactive ({stats.revokedCount})</TabsTrigger>
            <TabsTrigger value="claimable">Claimable ({stats.readyToClaimCount})</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/2"
              >
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </>
        ) : filteredSchedules.length > 0 ? (
          filteredSchedules.map((schedule, index) => {
            const scheduleKey = schedule.publicKey.toString();
            return (
              <RevealSection key={scheduleKey} delay={Math.min(280 + index * 45, 520)}>
                <ScheduleCard
                  schedule={schedule}
                  nowUnix={nowUnix}
                  partialInput={partialWithdrawInputs[scheduleKey] ?? ''}
                  onPartialInputChange={(value) => updatePartialWithdrawInput(scheduleKey, value)}
                  onPartialMax={() => setPartialWithdrawMax(scheduleKey, schedule.claimableRaw)}
                  processingActionKey={processingActionKey}
                  claimingAll={claimingAll}
                  onClaim={async (schedule: DecoratedSchedule, requestedRawAmount?: BN) => {
                    await handleClaim(schedule, requestedRawAmount);
                    await refetch();
                  }}
                  onRevoke={async (schedule: DecoratedSchedule) => {
                    await handleRevoke(schedule);
                    await refetch();
                  }}
                  onClose={async (schedule: DecoratedSchedule) => {
                    await handleClose(schedule);
                    await refetch();
                  }}
                />
              </RevealSection>
            );
          })
        ) : (
          <Card className="rounded-2xl border-dashed border-black/15 bg-white/65 dark:border-white/15 dark:bg-white/2">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10">
                <SearchEmptyIcon />
              </div>
              <p className="text-base font-medium">No schedules match this view.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Try clearing the search term or switching tabs to view more schedules.
              </p>
              {searchTerm && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 rounded-xl border-black/10 dark:border-white/15"
                  onClick={clearSearch}
                >
                  Clear Search
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

function SearchEmptyIcon() {
  return <RefreshCw className={cn('size-5 text-muted-foreground opacity-70')} />;
}
