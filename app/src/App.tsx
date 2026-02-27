import { Analytics } from '@vercel/analytics/react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { BackToTop } from './components/BackToTop';
import { ActionBar } from './components/dashboard/ActionBar';
import { BackgroundDecor } from './components/dashboard/BackgroundDecor';
import { HeroSection } from './components/dashboard/HeroSection';
import { RevealSection } from './components/dashboard/RevealSection';
import { SchedulesPanel } from './components/dashboard/SchedulesPanel';
import { StatsGrid } from './components/dashboard/StatsGrid';
import { WalletDisconnectedState } from './components/dashboard/WalletDisconnectedState';
import { LandingPage } from './components/landing/LandingPage';
import { DashboardProvider, useVestingContext } from './context/VestingDashboardContext';

function DashboardLayout() {
  const { connected } = useVestingContext();

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f5f8_42%,#edf0f6_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top,#1d2026_0%,#151820_48%,#11131a_100%)]">
      <BackgroundDecor />

      <Header />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <LandingPage />

        <section id="dashboard-control" className="scroll-mt-28 pt-6">
          <RevealSection>
            <HeroSection />
          </RevealSection>

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
        </section>
      </main>
      
      <Footer />
      <BackToTop />
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
