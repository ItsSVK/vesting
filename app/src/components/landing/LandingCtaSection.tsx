import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { RevealSection } from '../dashboard/RevealSection';

interface LandingCtaSectionProps {
  connected: boolean;
}

export function LandingCtaSection({ connected }: LandingCtaSectionProps) {
  return (
    <RevealSection>
      <Card className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/12 dark:bg-black/25">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.18),rgba(16,185,129,0.14),rgba(245,158,11,0.12))] dark:bg-[linear-gradient(120deg,rgba(56,189,248,0.15),rgba(16,185,129,0.1),rgba(245,158,11,0.08))]" />
        <CardContent className="relative flex flex-col items-start gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-3 py-1 text-xs font-medium text-neutral-700 dark:border-white/15 dark:bg-white/8 dark:text-neutral-200">
              <Sparkles className="size-3.5" />
              Production-ready vesting workflows
            </p>
            <h3 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              {connected ? 'You are connected. Start managing live schedules.' : 'Connect wallet and launch vesting control.'}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              The control panel below lets you create schedules, withdraw partial claims, revoke unvested amounts, and
              close completed vaults.
            </p>
          </div>

          <div className="flex w-full flex-wrap gap-3 lg:w-auto lg:justify-end">
            <Button
              asChild
              size="lg"
              className="h-11 rounded-full bg-neutral-900 px-6 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <a href="#dashboard-control">
                Go To Dashboard
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 rounded-full border-black/10 bg-white/75 px-6 dark:border-white/20 dark:bg-white/8"
            >
              <a href="#contract-flow">Review Contract Flow</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </RevealSection>
  );
}
