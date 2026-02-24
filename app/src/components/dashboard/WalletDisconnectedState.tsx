import { Lock } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

export function WalletDisconnectedState() {
  return (
    <Card className="rounded-[1.5rem] border-dashed border-black/15 bg-white/70 dark:border-white/15 dark:bg-white/[0.03]">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10">
          <Lock className="size-7 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Connect to start managing vesting vaults</h2>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Once connected, you can create schedules, claim vested tokens, revoke active grants, and close finished
          vaults from one interface.
        </p>
      </CardContent>
    </Card>
  );
}
