import { ArrowDownToLine, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { TOKEN_DECIMALS } from '../../dashboard/constants';
import { useVestingContext } from '../../context/VestingDashboardContext';

export function ActionBar() {
  const { claimingAll, stats, isFetching, handleClaimAll, refetch } = useVestingContext();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white/72 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/3">
      <Button size="lg" className="h-11 rounded-xl px-5" disabled={claimingAll || stats.readyToClaimCount === 0} onClick={() => void handleClaimAll()}>
        {claimingAll ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
        {claimingAll ? 'Claiming...' : 'Claim All Available'}
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="h-11 rounded-xl border-black/10 bg-white/75 dark:border-white/15 dark:bg-white/3"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
        Sync
      </Button>
      <p className="text-xs text-muted-foreground sm:text-sm">
        Claim-all submits one transaction per claimable schedule. Current precision assumes {TOKEN_DECIMALS} token
        decimals.
      </p>
    </div>
  );
}
