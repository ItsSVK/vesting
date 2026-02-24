import { useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { toast } from 'sonner';
import { ZERO } from '../dashboard/constants';
import type { DecoratedSchedule } from '../dashboard/types';
import { parseErrorMessage } from '../dashboard/utils';
// @ts-ignore
import type { Program } from '@coral-xyz/anchor';

interface UseVestingActionsProps {
  program: Program | null;
  publicKey: PublicKey | null;
  refetch: () => Promise<unknown>;
  setProcessingActionKey: (key: string | null) => void;
  setPartialWithdrawInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  decoratedSchedules: DecoratedSchedule[];
  setClaimingAll: (claiming: boolean) => void;
}

export function useVestingActions({
  program,
  publicKey,
  refetch,
  setProcessingActionKey,
  setPartialWithdrawInputs,
  decoratedSchedules,
  setClaimingAll,
}: UseVestingActionsProps) {
  const withdrawFromSchedule = useCallback(
    async (schedule: DecoratedSchedule, amountRaw: BN, silent = false): Promise<boolean> => {
      if (!program || !publicKey || amountRaw.lte(ZERO)) return false;

      const account = schedule.account;
      const vestingVault = getAssociatedTokenAddressSync(account.tokenMint, schedule.publicKey, true);
      const beneficiaryAta = getAssociatedTokenAddressSync(account.tokenMint, publicKey);

      try {
        const signature = await program.methods
          .withdraw(amountRaw)
          .accounts({
            beneficiary: publicKey,
            grantor: account.grantor,
            vestingState: schedule.publicKey,
            vestingVault,
            tokenMint: account.tokenMint,
            beneficiaryAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        if (!silent) {
          toast.success('Tokens claimed', {
            description: `Signature: ${signature.slice(0, 8)}...`,
          });
        }

        return true;
      } catch (error) {
        if (!silent) {
          toast.error('Claim failed', {
            description: parseErrorMessage(error),
          });
        }
        return false;
      }
    },
    [program, publicKey],
  );

  const handleClaim = useCallback(
    async (schedule: DecoratedSchedule, requestedRawAmount?: BN) => {
      const maxWithdrawableRaw = schedule.claimableRaw;
      if (maxWithdrawableRaw.lte(ZERO)) {
        toast.message('No claimable whole tokens right now.');
        return;
      }

      const rawAmount = requestedRawAmount ?? maxWithdrawableRaw;
      if (rawAmount.lte(ZERO)) {
        toast.message('Withdraw amount must be greater than zero.');
        return;
      }
      if (rawAmount.gt(maxWithdrawableRaw)) {
        toast.error('Withdraw amount exceeds current claimable balance.');
        return;
      }

      const scheduleKey = schedule.publicKey.toString();
      const actionKey = `claim:${scheduleKey}`;
      setProcessingActionKey(actionKey);

      try {
        const succeeded = await withdrawFromSchedule(schedule, rawAmount);
        if (succeeded) {
          setPartialWithdrawInputs((previous) => {
            if (!(scheduleKey in previous)) return previous;
            const next = { ...previous };
            delete next[scheduleKey];
            return next;
          });
          await refetch();
        }
      } finally {
        setProcessingActionKey(null);
      }
    },
    [refetch, withdrawFromSchedule, setProcessingActionKey, setPartialWithdrawInputs],
  );

  const handleRevoke = useCallback(
    async (schedule: DecoratedSchedule) => {
      if (!program || !publicKey) return;

      const actionKey = `revoke:${schedule.publicKey.toString()}`;
      setProcessingActionKey(actionKey);

      try {
        const account = schedule.account;
        const vestingVault = getAssociatedTokenAddressSync(account.tokenMint, schedule.publicKey, true);
        const grantorAta = getAssociatedTokenAddressSync(account.tokenMint, publicKey);

        const signature = await program.methods
          .revoke()
          .accounts({
            grantor: publicKey,
            beneficiary: account.beneficiary,
            vestingState: schedule.publicKey,
            vestingVault,
            tokenMint: account.tokenMint,
            grantorAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        toast.success('Schedule revoked', {
          description: `Signature: ${signature.slice(0, 8)}...`,
        });
        await refetch();
      } catch (error) {
        toast.error('Revoke failed', {
          description: parseErrorMessage(error),
        });
      } finally {
        setProcessingActionKey(null);
      }
    },
    [program, publicKey, refetch, setProcessingActionKey],
  );

  const handleClose = useCallback(
    async (schedule: DecoratedSchedule) => {
      if (!program || !publicKey) return;

      const actionKey = `close:${schedule.publicKey.toString()}`;
      setProcessingActionKey(actionKey);

      try {
        const account = schedule.account;
        const vestingVault = getAssociatedTokenAddressSync(account.tokenMint, schedule.publicKey, true);

        const signature = await program.methods
          .close()
          .accounts({
            grantor: publicKey,
            beneficiary: account.beneficiary,
            vestingState: schedule.publicKey,
            vestingVault,
            tokenMint: account.tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        toast.success('Vesting account closed', {
          description: `Signature: ${signature.slice(0, 8)}...`,
        });
        await refetch();
      } catch (error) {
        toast.error('Close failed', {
          description: parseErrorMessage(error),
        });
      } finally {
        setProcessingActionKey(null);
      }
    },
    [program, publicKey, refetch, setProcessingActionKey],
  );

  const handleClaimAll = useCallback(async () => {
    if (!program || !publicKey) return;

    const claimableSchedules = decoratedSchedules.filter(
      (schedule) => schedule.isBeneficiary && schedule.claimableRaw.gt(ZERO),
    );

    if (claimableSchedules.length === 0) {
      toast.message('No schedules are ready for claiming.');
      return;
    }

    setClaimingAll(true);
    let successfulClaims = 0;

    try {
      for (const schedule of claimableSchedules) {
        const succeeded = await withdrawFromSchedule(schedule, schedule.claimableRaw, true);
        if (succeeded) successfulClaims += 1;
      }

      await refetch();
    } finally {
      setClaimingAll(false);
    }

    if (successfulClaims === claimableSchedules.length) {
      toast.success('Claimed all available schedules', {
        description: `${successfulClaims} withdrawal transactions submitted.`,
      });
      return;
    }

    if (successfulClaims > 0) {
      toast.error('Partial claim finished', {
        description: `${successfulClaims}/${claimableSchedules.length} claims succeeded.`,
      });
      return;
    }

    toast.error('Claim all failed', {
      description: 'No claim transaction was accepted.',
    });
  }, [decoratedSchedules, program, publicKey, refetch, withdrawFromSchedule, setClaimingAll]);

  return {
    handleClaim,
    handleRevoke,
    handleClose,
    handleClaimAll,
  };
}
