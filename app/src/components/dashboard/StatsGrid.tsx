import { Activity, Clock3, Coins, ShieldAlert, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { formatTokenAmount } from '../../lib/formatters';
import type { DashboardStats } from '../../dashboard/types';
import { useVestingContext } from '../../context/VestingDashboardContext';

interface StatCard {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}

function buildCards(stats: DashboardStats): StatCard[] {
  return [
    {
      title: 'Allocated To You',
      value: formatTokenAmount(stats.totalAllocatedToBeneficiary),
      description: `${stats.receivingCount} incoming schedule(s)`,
      icon: Coins,
    },
    {
      title: 'Claimable Right Now',
      value: formatTokenAmount(stats.totalClaimable),
      description: `${stats.readyToClaimCount} schedule(s) ready`,
      icon: Activity,
    },
    {
      title: 'Active Schedules',
      value: stats.activeCount.toString(),
      description: `${stats.grantingCount} created by this wallet`,
      icon: Clock3,
    },
    {
      title: 'Revoked / Inactive',
      value: stats.revokedCount.toString(),
      description: `${stats.totalSchedules} total schedule(s)`,
      icon: ShieldAlert,
    },
  ];
}

export function StatsGrid() {
  const { stats } = useVestingContext();
  const cards = buildCards(stats);

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.title}
            className="rounded-2xl border-black/5 bg-white/78 shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/3"
          >
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center justify-between text-xs uppercase tracking-wide">
                <span>{item.title}</span>
                <Icon className="size-4 text-muted-foreground" />
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">{item.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
