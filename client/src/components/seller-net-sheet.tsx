import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";

interface SellerNetSheetProps {
  offerPrice: number;
  hoaFee?: number | null;     // monthly
  taxAmount?: number | null;  // annual
  className?: string;
}

function formatPrice(p: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p);
}

function calcNetSheet(offerPrice: number, hoaFee?: number | null, taxAmount?: number | null) {
  // Florida-specific closing costs
  const platformFee = offerPrice * 0.01;

  // Florida documentary stamps: $0.70 per $100
  const docStamps = Math.round(offerPrice * 0.007);

  // Florida title insurance (promulgated rate ~$5.75 per $1000 of sale price)
  const titleInsurance = Math.round(offerPrice * 0.00575);

  // Recording fees
  const recordingFees = 200;

  // HOA proration (assuming 2-month proration for typical 60-day closing period)
  const hoaProrated = hoaFee ? Math.round(hoaFee * 2) : 0;

  // Property tax proration (approx 4 months of the annual bill)
  const taxProrated = taxAmount ? Math.round(taxAmount / 12 * 4) : Math.round(offerPrice * 0.012 / 12 * 4);

  // Title search
  const titleSearch = 350;

  const totalDeductions = platformFee + titleInsurance + docStamps + recordingFees + hoaProrated + taxProrated + titleSearch;
  const netProceeds = Math.round(offerPrice - totalDeductions);

  // Traditional agent comparison (5.5% total commission)
  const traditionalCommission = offerPrice * 0.055;
  const savings = Math.round(traditionalCommission - platformFee);

  return {
    platformFee,
    titleInsurance,
    docStamps,
    recordingFees,
    hoaProrated,
    taxProrated,
    titleSearch,
    totalDeductions,
    netProceeds,
    savings,
  };
}

export function SellerNetSheet({ offerPrice, hoaFee, taxAmount, className }: SellerNetSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const net = calcNetSheet(offerPrice, hoaFee, taxAmount);

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setExpanded(!expanded)}
      >
        <TrendingUp className="mr-1.5 h-3.5 w-3.5 text-primary" />
        View Net Sheet
        {expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
      </Button>

      {expanded && (
        <Card className="mt-2 p-4 text-xs border-primary/20 bg-primary/5">
          <p className="font-semibold text-sm mb-3 text-primary">Seller Net Sheet</p>

          {/* Offer Price */}
          <div className="flex justify-between py-1.5 border-b font-medium text-sm">
            <span>Offer Price</span>
            <span>{formatPrice(offerPrice)}</span>
          </div>

          {/* Deductions */}
          <div className="space-y-1.5 mt-2">
            <div className="flex justify-between text-muted-foreground">
              <span>HomeDirectAI Fee (1%)</span>
              <span className="text-red-600">−{formatPrice(net.platformFee)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Title Insurance (est.)</span>
              <span className="text-red-600">−{formatPrice(net.titleInsurance)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Documentary Stamps (FL)</span>
              <span className="text-red-600">−{formatPrice(net.docStamps)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Recording Fees</span>
              <span className="text-red-600">−{formatPrice(net.recordingFees)}</span>
            </div>
            {net.hoaProrated > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>HOA Proration (~2 mo.)</span>
                <span className="text-red-600">−{formatPrice(net.hoaProrated)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Property Tax Proration (~4 mo.)</span>
              <span className="text-red-600">−{formatPrice(net.taxProrated)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Title Search</span>
              <span className="text-red-600">−{formatPrice(net.titleSearch)}</span>
            </div>
          </div>

          {/* Net Proceeds */}
          <div className="flex justify-between border-t pt-2 mt-2 font-bold text-sm text-primary">
            <span>Estimated Net Proceeds</span>
            <span>{formatPrice(net.netProceeds)}</span>
          </div>

          {/* Savings callout */}
          <div className="mt-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-2.5">
            <p className="text-green-700 dark:text-green-400 font-medium">
              You save {formatPrice(net.savings)} vs. traditional 5.5% agent commission
            </p>
          </div>

          <p className="mt-2 text-muted-foreground/70 italic">
            Estimates only. Final figures will appear on your Closing Disclosure.
            Does not include mortgage payoff.
          </p>
        </Card>
      )}
    </div>
  );
}
