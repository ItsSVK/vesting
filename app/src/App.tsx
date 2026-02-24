import { Analytics } from '@vercel/analytics/react';
import { Header } from './components/Header';
import { ActionBar } from './components/dashboard/ActionBar';
import { BackgroundDecor } from './components/dashboard/BackgroundDecor';
// import { ContractCapabilitiesGrid } from './components/dashboard/ContractCapabilitiesGrid';
import { HeroSection } from './components/dashboard/HeroSection';
import { RevealSection } from './components/dashboard/RevealSection';
import { SchedulesPanel } from './components/dashboard/SchedulesPanel';
import { StatsGrid } from './components/dashboard/StatsGrid';
import { WalletDisconnectedState } from './components/dashboard/WalletDisconnectedState';
import { DashboardProvider, useVestingContext } from './context/VestingDashboardContext';

function DashboardLayout() {
  const { connected } = useVestingContext();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f5f8_42%,#edf0f6_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top,#1d2026_0%,#151820_48%,#11131a_100%)]">
      <BackgroundDecor />

      <Header />

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <RevealSection>
          <HeroSection />
        </RevealSection>

        {/* <RevealSection delay={80} className="mt-7">
          <ContractCapabilitiesGrid />
        </RevealSection> */}

        {!connected ? (
          <RevealSection delay={140} className="mt-7">
            <WalletDisconnectedState />
          </RevealSection>
        ) : (
          <>
            <RevealSection delay={140} className="mt-7">
              <StatsGrid />
            </RevealSection>

            <RevealSection delay={200} className="mt-5">
              <ActionBar />
            </RevealSection>

            <RevealSection delay={260} className="mt-7">
              <SchedulesPanel />
            </RevealSection>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <DashboardProvider>
      <DashboardLayout />
      <Analytics />
    </DashboardProvider>
  );
}

export default App;
