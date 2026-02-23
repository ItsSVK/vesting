import { Header } from './components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { Activity, Clock, Lock } from 'lucide-react';
import { useVestingSchedules } from './hooks/useVestingSchedules';
import { VestingScheduleCard } from './components/VestingScheduleCard';
import { CreateScheduleDialog } from './components/CreateScheduleDialog';
import { formatTokenAmount } from './lib/formatters';
import { BN } from '@coral-xyz/anchor';
import { useMemo } from 'react';

function App() {
  const { connected, publicKey } = useWallet();
  const { data: schedules, isLoading } = useVestingSchedules();

  // Calculate high-level stats based on fetched schedules
  const stats = useMemo(() => {
    if (!schedules || !publicKey) return { totalVested: new BN(0), totalClaimable: new BN(0), activeCount: 0, beneficiaryCount: 0, grantorCount: 0 };
    
    let totalVested = new BN(0);
    let totalClaimable = new BN(0);
    let activeCount = 0;
    let beneficiaryCount = 0;
    let grantorCount = 0;
    
    const now = new BN(Math.floor(Date.now() / 1000));
    const userPubkey = publicKey.toString();

    schedules.forEach((item: any) => {
      const acc = item.account;
      if (acc.isActive) activeCount++;
      if (acc.beneficiary.toString() === userPubkey) beneficiaryCount++;
      if (acc.grantor.toString() === userPubkey) grantorCount++;
      
      // Only count towards "Total Vested" if the user is the beneficiary
      if (acc.beneficiary.toString() === userPubkey) {
        totalVested = totalVested.add(acc.totalAmount);
        
        let claimable = new BN(0);
        if (acc.isActive && now.gte(acc.cliffTime)) {
            const timeElapsed = now.sub(acc.cliffTime);
            const completedPeriods = timeElapsed.div(acc.frequency);
            const totalDuration = acc.vestingEndTime.sub(acc.startTime);
            const totalPeriods = totalDuration.div(acc.frequency);
            const tokensPerPeriod = acc.totalAmount.div(totalPeriods);
            let vestedTillNow = completedPeriods.mul(tokensPerPeriod);
            if (vestedTillNow.gt(acc.totalAmount)) vestedTillNow = acc.totalAmount;
            claimable = vestedTillNow.sub(acc.totalWithdrawn);
        }
        totalClaimable = totalClaimable.add(claimable);
      }
    });

    return { totalVested, totalClaimable, activeCount, beneficiaryCount, grantorCount };
  }, [schedules, publicKey]);


  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 font-sans text-foreground selection:bg-primary/30">
      <Header />
      
      <main className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-2">
              Dashboard
            </h1>
            <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl">
              Manage your vested tokens seamlessly. Claim available tokens or initialize new vesting schedules.
            </p>
          </div>

          {!connected ? (
            <Card className="border-dashed bg-transparent border-2 shadow-none flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Lock className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">Wallet Not Connected</h3>
              <p className="text-muted-foreground max-w-sm">
                Please connect your Solana wallet to view your vesting schedules and claim tokens.
              </p>
            </Card>
          ) : (
            <>
              {/* Stats Row */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-card hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Allocated</CardTitle>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatTokenAmount(stats.totalVested)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                       Total tokens assigned to you
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Available to Claim</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">{formatTokenAmount(stats.totalClaimable)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ready to be withdrawn
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activeCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.beneficiaryCount} Receiving, {stats.grantorCount} Granted
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Area */}
              <div className="grid gap-6 md:grid-cols-7 lg:grid-cols-3 mt-8">
                <Card className="md:col-span-4 lg:col-span-2 shadow-sm border-neutral-200 dark:border-neutral-800">
                  <CardHeader>
                    <CardTitle>Your Vesting Schedules</CardTitle>
                    <CardDescription>
                      Overview of all tokens currently vesting.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading schedules...</div>
                    ) : schedules && schedules.length > 0 ? (
                      schedules.map((schedule: any) => (
                        <VestingScheduleCard 
                           key={schedule.publicKey.toString()} 
                           schedule={schedule}
                           onClaim={() => {
                             // Refetch might be available on the query object. Let's force a reload for now.
                             // Properly, we should export refetch from useVestingSchedules
                             window.location.reload(); 
                           }}
                        />
                      ))
                    ) : (
                      <div className="text-center py-10 border border-dashed rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50">
                        <p className="text-muted-foreground text-sm">No vesting schedules found for this wallet.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-3 lg:col-span-1 shadow-sm border-neutral-200 dark:border-neutral-800">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Common operations</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                     <Button className="w-full justify-start h-12" variant="default" disabled={stats.totalClaimable.eq(new BN(0))}>
                        Claim All Available Tokens
                     </Button>
                     <CreateScheduleDialog />
                  </CardContent>
                </Card>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  )
}

export default App
