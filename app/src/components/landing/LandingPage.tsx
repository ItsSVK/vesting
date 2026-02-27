import { formatTokenAmount } from '../../lib/formatters';
import { useVestingContext } from '../../context/VestingDashboardContext';
import { LandingCtaSection } from './LandingCtaSection';
import { LandingContractCodeSection } from './LandingContractCodeSection';
import { LandingFlowSection } from './LandingFlowSection';
import { LandingHero } from './LandingHero';
import { LandingTrustSection } from './LandingTrustSection';

export function LandingPage() {
  const { connected, scrollY, stats } = useVestingContext();

  return (
    <section className="space-y-16 pb-4 pt-1 sm:space-y-20">
      <LandingHero
        connected={connected}
        totalSchedules={stats.totalSchedules}
        readyToClaimCount={stats.readyToClaimCount}
        claimableAmountLabel={formatTokenAmount(stats.totalClaimable)}
        scrollY={scrollY}
      />

      <LandingFlowSection />
      <LandingContractCodeSection />
      <LandingTrustSection />
      <LandingCtaSection connected={connected} />
    </section>
  );
}
