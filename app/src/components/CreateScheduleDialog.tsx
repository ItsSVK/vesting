import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from 'sonner';
import { useWorkspace } from '../hooks/useWorkspace';
import { BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  beneficiary: z.string().refine((val) => {
    try { new PublicKey(val); return true; } catch { return false; }
  }, "Invalid Solana address"),
  tokenMint: z.string().refine((val) => {
    try { new PublicKey(val); return true; } catch { return false; }
  }, "Invalid Token Mint address"),
  totalAmount: z.coerce.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  unit: z.enum(["Sec", "Min", "Hour", "Day", "Week", "Month", "Year"]),
  cliffDays: z.coerce.number({ invalid_type_error: "Required" }).min(0, "Must be >= 0"),
  vestingDurationDays: z.coerce.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  frequencyDays: z.coerce.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
}).refine((data) => data.frequencyDays <= data.vestingDurationDays, {
  message: "Freq must be <= duration",
  path: ["frequencyDays"],
});

export function CreateScheduleDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { program, wallet } = useWorkspace();

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

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!program || !wallet) return;
    // setLoading(true);

    console.log(values);

    try {
        const beneficiaryPubkey = new PublicKey(values.beneficiary);
        const tokenMintPubkey = new PublicKey(values.tokenMint);
        
        // Time calculations
        let multiplier = 1; 
        switch (values.unit) {
            case 'Min': multiplier = 60; break;
            case 'Hour': multiplier = 60 * 60; break;
            case 'Day': multiplier = 24 * 60 * 60; break;
            case 'Week': multiplier = 7 * 24 * 60 * 60; break;
            case 'Month': multiplier = 30 * 24 * 60 * 60; break; 
            case 'Year': multiplier = 365 * 24 * 60 * 60; break; 
        }
        
        const now = Math.floor(Date.now() / 1000);
        const startTime = new BN(now);
        const cliffTime = new BN(now + (values.cliffDays * multiplier)); 
        const vestingDuration = new BN(values.vestingDurationDays * multiplier);
        const frequency = new BN(values.frequencyDays * multiplier);
        
        // Amount
        const amount = new BN(values.totalAmount);

        // PDAs and ATAs
        const [vestingStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("vesting_state"), wallet.publicKey.toBuffer(), beneficiaryPubkey.toBuffer()],
            program.programId
        );
        const vestingVault = getAssociatedTokenAddressSync(tokenMintPubkey, vestingStatePda, true);
        const grantorAta = getAssociatedTokenAddressSync(tokenMintPubkey, wallet.publicKey);

        // console.log({startTime: startTime.toNumber(), cliffTime: cliffTime.toNumber(), vestingDuration: vestingDuration.toNumber(), amount: amount.toNumber(), frequency: frequency.toNumber()})

        const tx = await program.methods
            .initialize(startTime, cliffTime, vestingDuration, amount, frequency)
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

    } catch (err: any) {
        console.error(err);
        toast.error("Failed to create schedule", {
            description: err.message || "Unknown error occurred"
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
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
                  <FormLabel>Token Mint Address</FormLabel>
                  <FormControl>
                    <Input placeholder="SPL Token Mint" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
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
                      <Input type="number" step="any" placeholder="1000" min={0} {...field} value={field.value ?? ''} />
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
                        <Input type="number" min={0} {...field} value={field.value ?? ''} />
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
                        <Input type="number" min={0} {...field} value={field.value ?? ''} />
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
                        <Input type="number" min={0} {...field} value={field.value ?? ''} />
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
