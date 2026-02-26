import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { useWorkspace } from '../hooks/useWorkspace';
import { BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useVestingSchedules } from '@/hooks/useVestingSchedules';
import { parseErrorMessage } from '@/dashboard/utils';

const formSchema = z.object({
  beneficiary: z.string().refine((val) => {
    try { new PublicKey(val); return true; } catch { return false; }
  }, "Invalid Solana address"),
  tokenMint: z.string().refine((val) => {
    try { new PublicKey(val); return true; } catch { return false; }
  }, "Invalid Token Mint address"),
  totalAmount: z.coerce.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  unit: z.enum(["Sec", "Min", "Hour", "Day", "Week", "Month", "Year"]),
  cliffDays: z.coerce.number({ invalid_type_error: "Required" }).int("No fractions").min(0, "Must be >= 0"),
  vestingDurationDays: z.coerce.number({ invalid_type_error: "Required" }).int("No fractions").positive("Must be > 0"),
  frequencyDays: z.coerce.number({ invalid_type_error: "Required" }).int("No fractions").positive("Must be > 0"),
}).refine((data) => data.frequencyDays <= data.vestingDurationDays, {
  message: "Freq must be <= duration",
  path: ["frequencyDays"],
});

export function CreateScheduleDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { program, wallet } = useWorkspace();
  const { data: existingSchedules = [], refetch } = useVestingSchedules();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      beneficiary: '',
      tokenMint: '',
      totalAmount: undefined,
      vestingDurationDays: undefined,
      cliffDays: undefined,
      frequencyDays: undefined,
      unit: 'Sec'
    },
  });

  // Map string unit values to Anchor enum format
  const TimeUnit: Record<string, object> = {
    Sec:   { sec: {} },
    Min:   { min: {} },
    Hour:  { hour: {} },
    Day:   { day: {} },
    Week:  { week: {} },
    Month: { month: {} },
    Year:  { year: {} },
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!program || !wallet) return;
    setLoading(true);

    try {
        const beneficiaryPubkey = new PublicKey(values.beneficiary);
        const tokenMintPubkey = new PublicKey(values.tokenMint);

        const scheduleExists = existingSchedules.some((item: unknown) => {
          const account = (item as {
            account?: {
              grantor: PublicKey;
              beneficiary: PublicKey;
              tokenMint: PublicKey;
            };
          }).account;
          if (!account) return false;

          return (
            account.grantor.toString() === wallet.publicKey.toString() &&
            account.beneficiary.toString() === beneficiaryPubkey.toString() &&
            account.tokenMint.toString() === tokenMintPubkey.toString()
          );
        });
        if (scheduleExists) {
          toast.error("Schedule already exists", {
            description: "A vesting schedule for this beneficiary and mint already exists for your wallet.",
          });
          return;
        }
        
        // Contract now takes raw durations — it multiplies by the unit internally
        const cliffDuration = new BN(values.cliffDays);
        const vestingDuration = new BN(values.vestingDurationDays);
        const frequency = new BN(values.frequencyDays);
        const amount = new BN(values.totalAmount);
        const unit = TimeUnit[values.unit];

        // PDAs and ATAs
        const [vestingStatePda] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("vesting_state"),
              wallet.publicKey.toBuffer(),
              beneficiaryPubkey.toBuffer(),
              tokenMintPubkey.toBuffer(),
            ],
            program.programId
        );
        const vestingVault = getAssociatedTokenAddressSync(tokenMintPubkey, vestingStatePda, true);
        const grantorAta = getAssociatedTokenAddressSync(tokenMintPubkey, wallet.publicKey);

        const tx = await program.methods
            .initialize(cliffDuration, vestingDuration, amount, frequency, unit)
            .accounts({
                grantor: wallet.publicKey,
                beneficiary: beneficiaryPubkey,
                tokenMint: tokenMintPubkey,
                grantorAta,
                vestingState: vestingStatePda,
                vestingVault,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        toast.success("Vesting Schedule Created!", {
            description: `Transaction Signature: ${tx.slice(0,8)}...`
        });
        setOpen(false);
        form.reset();
        refetch();

    } catch (err: unknown) {
        console.error(err);
        toast.error("Failed to create schedule", {
            description: parseErrorMessage(err),
        });
    } finally {
        setLoading(false);
        refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) form.reset();
    }}>
      <DialogTrigger asChild>
        <Button className="w-full justify-start h-12" variant="outline">
          Create Vesting Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Schedule</DialogTitle>
          <DialogDescription>
            Lock SPL tokens into a linear vesting contract for a beneficiary.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4" noValidate>
            <FormField
              control={form.control}
              name="beneficiary"
              render={({ field }) => (
                <FormItem className="grid gap-1.5">
                  <FormLabel>Beneficiary Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Solana Wallet Address" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tokenMint"
              render={({ field }) => (
                <FormItem className="grid gap-1.5">
                  <FormLabel>Token Mint Address (Devnet)</FormLabel>
                  <FormControl>
                    <Input placeholder="SPL Token Mint" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                  <div className="mt-1 flex gap-2 ">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-2 flex-1"
                      onClick={() => field.onChange("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")}
                    >
                      <img 
                        src="src/assets/USDC-icon_128x128.png" 
                        alt="USDC" 
                        className="w-4 h-4 rounded-full" 
                      />
                      USDC
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-2 flex-1"
                      onClick={() => field.onChange("HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr")}
                    >
                      <img 
                        src="src/assets/EURC-icon_128x128.png" 
                        alt="EURC" 
                        className="w-4 h-4 rounded-full" 
                      />
                      EURC
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                    <Info className="w-4 h-4 shrink-0 text-primary" />
                    <p>
                      Need Devnet tokens? <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Get them from Circle Faucet</a>
                    </p>
                  </div>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4 items-start">
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem className="grid gap-1.5">
                    <FormLabel>Total Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" placeholder="1000" min={1} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem className="grid gap-1.5">
                    <FormLabel>Calculate in</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Sec">Seconds</SelectItem>
                        <SelectItem value="Min">Minutes</SelectItem>
                        <SelectItem value="Hour">Hours</SelectItem>
                        <SelectItem value="Day">Days</SelectItem>
                        <SelectItem value="Week">Weeks</SelectItem>
                        <SelectItem value="Month">Months</SelectItem>
                        <SelectItem value="Year">Years</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4 items-start">
               <FormField
                  control={form.control}
                  name="cliffDays"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Cliff ({form.watch("unit")})</FormLabel>
                      <FormControl>
                        <Input type="number" step={1} min={0} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
               <FormField
                  control={form.control}
                  name="vestingDurationDays"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Duration ({form.watch("unit")})</FormLabel>
                      <FormControl>
                        <Input type="number" step={1} min={1} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
               <FormField
                  control={form.control}
                  name="frequencyDays"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Freq ({form.watch("unit")})</FormLabel>
                      <FormControl>
                        <Input type="number" step={1} min={1} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
            </div>
            
            <DialogFooter className="mt-4">
               <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Initialize Vault"}
               </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
