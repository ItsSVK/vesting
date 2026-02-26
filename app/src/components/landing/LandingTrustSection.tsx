import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { TRUST_POINTS } from './content';
import { RevealSection } from '../dashboard/RevealSection';

const SEED_SNIPPET = `seeds = [
  b"vesting_state",
  grantor,
  beneficiary,
  token_mint
]`;

export function LandingTrustSection() {
  return (
    <section>
      <RevealSection>
        <div className="mx-auto max-w-3xl space-y-3 text-center">
          <Badge className="rounded-full border-0 bg-black/80 px-3 py-1 text-white dark:bg-white/18">
            Why This Is Reliable
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
            Security guarantees from account constraints, not UI assumptions.
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
            The frontend surfaces protocol guarantees clearly so users understand what can and cannot happen on-chain.
          </p>
        </div>
      </RevealSection>

      <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.92fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {TRUST_POINTS.map((point, index) => {
            const Icon = point.icon;
            return (
              <RevealSection key={point.title} delay={100 + index * 80}>
                <Card className="h-full rounded-3xl border-black/10 bg-white/76 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-lg dark:border-white/15 dark:bg-white/5">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-black/8 bg-white/90 dark:border-white/12 dark:bg-white/10">
                      <Icon className="size-5 text-neutral-700 dark:text-neutral-100" />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                      {point.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{point.description}</p>
                  </CardContent>
                </Card>
              </RevealSection>
            );
          })}
        </div>

        <RevealSection delay={220}>
          <Card className="h-full rounded-3xl border-black/10 bg-neutral-950 text-neutral-100 shadow-[0_24px_58px_-38px_rgba(0,0,0,0.75)] dark:border-white/15">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">PDA Isolation Blueprint</p>
              <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-emerald-200">
                <code>{SEED_SNIPPET}</code>
              </pre>
              <p className="text-sm leading-relaxed text-neutral-300">
                Seed composition now includes the mint, so one grantor-beneficiary pair can safely run independent
                schedules for USDC, EURC, and other tokens without collisions.
              </p>
            </CardContent>
          </Card>
        </RevealSection>
      </div>
    </section>
  );
}
