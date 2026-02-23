import type { FC } from 'react';
import { Button } from './ui/button';
import { formatTokenAmount, formatDate } from '../lib/formatters';
import { useWorkspace } from '../hooks/useWorkspace';
import { BN } from '@coral-xyz/anchor';
import { Activity, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';

interface VestingScheduleCardProps {
  schedule: any; // Using any for simplicity here, would normally type to IDL account type
  onClaim?: () => void;
}

export const VestingScheduleCard: FC<VestingScheduleCardProps> = ({ schedule, onClaim }) => {
  const { wallet, program } = useWorkspace();
  const acc = schedule.account;
  const isBeneficiary = wallet?.publicKey?.toString() === acc.beneficiary.toString();
  const isGrantor = wallet?.publicKey?.toString() === acc.grantor.toString();

  // Basic vesting logic mirroring the smart contract's VestingState::vested_amount()
  const now = new BN(Math.floor(Date.now() / 1000));
  let claimable = new BN(0);
  
  if (acc.isActive && now.gte(acc.cliffTime)) {
      const timeElapsed = now.sub(acc.cliffTime);
      const completedPeriods = timeElapsed.div(acc.frequency);
      const totalDuration = acc.vestingEndTime.sub(acc.startTime);
      const totalPeriods = totalDuration.div(acc.frequency);
      const tokensPerPeriod = acc.totalAmount.div(totalPeriods);
      
      let vestedTillNow = completedPeriods.mul(tokensPerPeriod);
      if (vestedTillNow.gt(acc.totalAmount)) {
          vestedTillNow = acc.totalAmount;
      }
      
      claimable = vestedTillNow.sub(acc.totalWithdrawn);
  }

  // Derive the vestingVault ATA (it's owned by the vestingState PDA)
  const vestingVault = getAssociatedTokenAddressSync(acc.tokenMint, schedule.publicKey, true);

  // Convert scaled claimable (with decimals) to raw amount for the contract
  // The contract auto-scales by 10^decimals, so we need to pass raw tokens
  const TOKEN_DECIMALS = 6;
  const claimableRaw = claimable.div(new BN(10 ** TOKEN_DECIMALS));

  const handleClaim = async () => {
      if (!program || !wallet) return;
      try {
          const beneficiaryAta = getAssociatedTokenAddressSync(acc.tokenMint, wallet.publicKey);

          const tx = await program.methods
              .withdraw(claimableRaw)
              .accounts({
                  beneficiary: wallet.publicKey,
                  grantor: acc.grantor,
                  vestingState: schedule.publicKey,
                  vestingVault,
                  tokenMint: acc.tokenMint,
                  beneficiaryAta: beneficiaryAta,
                  tokenProgram: TOKEN_PROGRAM_ID,
                  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                  systemProgram: SystemProgram.programId,
              })
              .rpc();

          toast.success("Tokens Claimed Successfully!", {
              description: `Transaction Signature: ${tx.slice(0, 8)}...`
          });
          if (onClaim) onClaim();
          
      } catch (err: any) {
          console.error("Claim error:", err);
          toast.error("Failed to claim tokens", {
              description: err.message || "Unknown error occurred"
          });
      }
  };

  const handleRevoke = async () => {
    if (!program || !wallet) return;
    try {
        const grantorAta = getAssociatedTokenAddressSync(acc.tokenMint, wallet.publicKey);

        const tx = await program.methods
            .revoke()
            .accounts({
                grantor: wallet.publicKey,
                beneficiary: acc.beneficiary,
                vestingState: schedule.publicKey,
                vestingVault,
                tokenMint: acc.tokenMint,
                grantorAta,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        toast.success("Schedule Revoked Successfully!", {
            description: `Transaction Signature: ${tx.slice(0, 8)}...`
        });
        if (onClaim) onClaim(); // reusing onClaim to trigger a refetch
        
    } catch (err: any) {
        console.error("Revoke error:", err);
        toast.error("Failed to revoke schedule", {
            description: err.message || "Unknown error occurred"
        });
    }
  };

  const handleClose = async () => {
    if (!program || !wallet) return;
    try {
        const tx = await program.methods
            .close()
            .accounts({
                grantor: wallet.publicKey,
                beneficiary: acc.beneficiary,
                vestingState: schedule.publicKey,
                vestingVault,
                tokenMint: acc.tokenMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        toast.success("Schedule Closed Successfully!", {
            description: `Transaction Signature: ${tx.slice(0, 8)}...`
        });
        if (onClaim) onClaim(); // refetch accounts
        
    } catch (err: any) {
        console.error("Close error:", err);
        toast.error("Failed to close schedule", {
            description: err.message || "Unknown error occurred"
        });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border rounded-xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all gap-4">
      <div className="flex gap-4 items-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          {isBeneficiary ? <Activity className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-orange-500" />}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base leading-none">
              {isBeneficiary ? "Receiving Tokens" : "Granted Tokens"}
            </p>
            {!acc.isActive && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Revoked</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 line-clamp-1">
             <span className="hidden sm:inline">From:</span>
             <span className="font-mono text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">
                {isGrantor ? acc.beneficiary.toString().slice(0, 4) + '...' + acc.beneficiary.toString().slice(-4) 
                           : acc.grantor.toString().slice(0, 4) + '...' + acc.grantor.toString().slice(-4)}
             </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
             Ends: {formatDate(acc.vestingEndTime)}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:items-end gap-3 shrink-0">
        <div className="text-left sm:text-right">
          <p className="font-bold text-lg">
             {formatTokenAmount(acc.totalWithdrawn)} / {formatTokenAmount(acc.totalAmount)}
          </p>
          <div className="flex items-center sm:justify-end gap-1.5 mt-0.5">
              <div className={`h-2 w-2 rounded-full ${claimable.gt(new BN(0)) ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300 dark:bg-neutral-700'}`} />
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {formatTokenAmount(claimable)} Claimable
              </p>
          </div>
        </div>

        {isBeneficiary && acc.isActive && claimable.gt(new BN(0)) && (
            <Button onClick={handleClaim} size="sm" className="w-full sm:w-auto mt-1">
                Claim Tokens
            </Button>
        )}
        {isGrantor && acc.isActive && (
            <Button variant="destructive" size="sm" className="w-full sm:w-auto mt-1" onClick={handleRevoke}>
                Revoke Schedule
            </Button>
        )}
        {isGrantor && !acc.isActive && (
            <Button variant="secondary" size="sm" className="w-full sm:w-auto mt-1 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={handleClose}>
                Close Account
            </Button>
        )}
      </div>
    </div>
  );
};
