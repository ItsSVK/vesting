import { ArrowRight, Wallet } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import { FLOW_STEPS, HERO_CHIPS } from './content';

interface LandingHeroProps {
  connected: boolean;
  totalSchedules: number;
  readyToClaimCount: number;
  claimableAmountLabel: string;
  scrollY: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function LandingHero({
  connected,
  totalSchedules,
  readyToClaimCount,
  claimableAmountLabel,
  scrollY,
}: LandingHeroProps) {
  const fade = clamp(1 - scrollY / 720, 0.35, 1);
  const heroLift = clamp(scrollY * 0.06, 0, 42);
  const orbitalShift = clamp(scrollY * 0.04, 0, 36);
  const readinessWidth = readyToClaimCount <= 0 ? 0 : clamp(readyToClaimCount * 16, 10, 100);

  return (
    <section className="relative overflow-hidden rounded-[2.25rem] border border-white/65 bg-white/70 p-6 shadow-[0_50px_140px_-72px_rgba(11,15,25,0.55)] backdrop-blur-2xl sm:p-9 dark:border-white/15 dark:bg-black/25">
      <div
        className="pointer-events-none absolute -left-24 -top-20 size-80"
        style={{ transform: `translate3d(0, ${orbitalShift * -0.45}px, 0)` }}
      >
        <div className="size-full rounded-full bg-sky-300/45 blur-3xl animate-[landing-float_14s_ease-in-out_infinite]" />
      </div>
      <div
        className="pointer-events-none absolute -right-20 top-20 size-72"
        style={{ transform: `translate3d(0, ${orbitalShift * 0.38}px, 0)` }}
      >
        <div className="size-full rounded-full bg-emerald-300/40 blur-3xl animate-[landing-float_12s_ease-in-out_infinite_reverse]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.82),transparent_58%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_62%)]" />

      <div
        className="relative grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-end"
        style={{ transform: `translate3d(0, ${heroLift * -1}px, 0)`, opacity: fade }}
      >
        <div className="space-y-5">
          <Badge className="rounded-full border-0 bg-black/80 px-3 py-1 text-white dark:bg-white/20">
            Solana Vesting Vault Protocol
          </Badge>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl dark:text-neutral-50">
            Token vesting with precise control, partial claims, and contract-level safety.
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-neutral-700 sm:text-base dark:text-neutral-300">
            Create deterministic schedules, stream unlocks over time, revoke only what remains unvested, and close
            accounts only when vault balances are truly empty.
          </p>

          <div className="flex flex-wrap gap-2">
            {HERO_CHIPS.map((chip) => {
              const Icon = chip.icon;
              return (
                <Badge
                  key={chip.label}
                  variant="outline"
                  className="rounded-full border-white/70 bg-white/70 px-3 py-1 text-neutral-700 backdrop-blur-md dark:border-white/20 dark:bg-white/10 dark:text-neutral-200"
                >
                  <Icon className="size-3.5" />
                  {chip.label}
                </Badge>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              asChild
              size="lg"
              className="h-11 rounded-full bg-neutral-900 px-6 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <a href="#dashboard-control">
                Open Dashboard
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 rounded-full border-black/10 bg-white/80 px-6 dark:border-white/20 dark:bg-white/8"
            >
              <a href="#contract-flow">See Contract Flow</a>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Card className="rounded-3xl border-white/80 bg-white/85 shadow-[0_25px_70px_-45px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                  Live Wallet Signal
                </p>
                <Badge
                  className={cn(
                    'rounded-full border-0 px-2.5 py-0.5 text-xs',
                    connected
                      ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/18 dark:text-emerald-300'
                      : 'bg-amber-500/18 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300',
                  )}
                >
                  {connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-black/5 bg-white/80 p-3 dark:border-white/10 dark:bg-white/6">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Total Schedules</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{totalSchedules}</p>
                </div>
                <div className="rounded-2xl border border-black/5 bg-white/80 p-3 dark:border-white/10 dark:bg-white/6">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Claimable Now</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{claimableAmountLabel}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="mb-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Ready-to-Claim Schedules</span>
                  <Wallet className="size-3.5" />
                </div>
                <div className="h-2 rounded-full bg-black/8 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 transition-all duration-700"
                    style={{ width: `${readinessWidth}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {readyToClaimCount} schedule(s) can be withdrawn right now.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="absolute -bottom-5 right-4 w-[78%] rounded-2xl border-white/70 bg-white/88 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-black/35 sm:-right-2">
            <CardContent className="p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                Instruction Sequence
              </p>
              <div className="space-y-2">
                {FLOW_STEPS.map((step, index) => (
                  <div key={step.title} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700 dark:text-neutral-200">{step.title}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">0{index + 1}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
