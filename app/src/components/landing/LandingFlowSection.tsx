import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { FLOW_STEPS } from './content';
import { RevealSection } from '../dashboard/RevealSection';

export function LandingFlowSection() {
  return (
    <section id="contract-flow" className="scroll-mt-28">
      <RevealSection>
        <div className="mx-auto max-w-3xl space-y-3 text-center">
          <Badge className="rounded-full border-0 bg-neutral-900 px-3 py-1 text-neutral-50 dark:bg-white/15 dark:text-neutral-100">
            Contract Flow
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
            Built around the exact on-chain lifecycle.
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
            Every action in the UI mirrors a real instruction: initialize, partial withdraw, revoke, and close.
          </p>
        </div>
      </RevealSection>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <RevealSection key={step.title} delay={80 + index * 70}>
              <Card className="group relative h-full overflow-hidden rounded-3xl border-black/10 bg-white/75 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_22px_50px_-34px_rgba(0,0,0,0.55)] dark:border-white/15 dark:bg-white/5">
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b ${step.accentClass}`} />
                <CardContent className="relative space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-black/10 bg-white/85 text-neutral-700 transition-transform duration-500 group-hover:scale-105 dark:border-white/15 dark:bg-white/10 dark:text-neutral-100">
                      <Icon className="size-5" />
                    </div>
                    <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">0{index + 1}</span>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{step.description}</p>
                  </div>

                  <p className="rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-xs text-neutral-600 dark:border-white/12 dark:bg-black/25 dark:text-neutral-300">
                    {step.highlight}
                  </p>
                </CardContent>
              </Card>
            </RevealSection>
          );
        })}
      </div>
    </section>
  );
}
