import { ArrowDownToLine, ArrowUpToLine, ShieldAlert, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

const CONTRACT_CAPABILITIES: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: 'Initialize',
    description: 'Grantor creates a vesting state PDA and funds the vault with locked tokens.',
    icon: ArrowUpToLine,
  },
  {
    title: 'Withdraw',
    description: 'Beneficiary withdraws vested tokens after cliff and by schedule frequency.',
    icon: ArrowDownToLine,
  },
  {
    title: 'Revoke',
    description: 'Grantor revokes active vesting and recovers only the unvested balance.',
    icon: ShieldAlert,
  },
  {
    title: 'Close',
    description: 'Grantor closes vault/state once vault balance reaches zero and vesting is finished.',
    icon: XCircle,
  },
];

export function ContractCapabilitiesGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {CONTRACT_CAPABILITIES.map((capability, index) => {
        const Icon = capability.icon;
        return (
          <Card
            key={capability.title}
            className="group rounded-2xl border-black/5 bg-white/75 shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/2"
          >
            <CardContent className="p-4">
              <div
                className="mb-3 flex size-9 items-center justify-center rounded-xl bg-black/5 text-neutral-700 transition-transform duration-500 group-hover:scale-110 dark:bg-white/10 dark:text-neutral-100"
                style={{ transitionDelay: `${index * 40}ms` }}
              >
                <Icon className="size-4" />
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{capability.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{capability.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
