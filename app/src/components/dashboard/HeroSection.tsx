import { Lock, RefreshCw, Sparkles } from 'lucide-react';
import { CreateScheduleDialog } from '../CreateScheduleDialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import { shortenAddress } from '../../dashboard/utils';
import { useVestingContext } from '../../context/VestingDashboardContext';

export function HeroSection() {
  const { connected, publicKey, isFetching, refetch } = useVestingContext();

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-black/25">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_44%)] dark:bg-[linear-gradient(120deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_44%)]" />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <Badge className="rounded-full bg-neutral-900 px-3 py-1 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900">
            <Sparkles className="size-3.5" />
            Solana Vesting Vault
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl dark:text-neutral-50">
            A cleaner control surface for initialize, withdraw, revoke, and close.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
            This dashboard mirrors the program logic directly: grantors create and fund schedules, beneficiaries
            withdraw vested amounts, grantors can revoke unvested balances, and accounts close once vaults are empty.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={connected ? 'secondary' : 'outline'}
              className={cn(
                'rounded-full',
                connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'border-amber-400/40 bg-amber-100/70 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
              )}
            >
              {connected ? 'Wallet Connected' : 'Wallet Not Connected'}
            </Badge>
            {publicKey && (
              <Badge
                variant="outline"
                className="rounded-full border-black/10 bg-white/70 font-mono text-xs dark:border-white/15 dark:bg-white/5"
              >
                {shortenAddress(publicKey.toString(), 6)}
              </Badge>
            )}
          </div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {connected ? (
            <>
              <CreateScheduleDialog />
              <Button
                variant="outline"
                className="h-12 w-full justify-start rounded-xl border-black/10 bg-white/70 text-left hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
                Refresh On-Chain Schedules
              </Button>
            </>
          ) : (
            <Card className="rounded-2xl border-dashed border-black/15 bg-white/60 dark:border-white/20 dark:bg-white/2">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10">
                  <Lock className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect a wallet to load schedules and execute vesting actions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
