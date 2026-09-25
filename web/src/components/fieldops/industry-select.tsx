"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INDUSTRY_MAX_LENGTH,
  OTHER_INDUSTRY,
  STANDARD_INDUSTRIES,
  type StandardIndustry,
} from "@/lib/industry";

export type IndustrySelection = StandardIndustry | typeof OTHER_INDUSTRY | "";

export function IndustrySelect({
  id = "industry",
  selection,
  custom,
  onSelectionChange,
  onCustomChange,
  required = false,
  disabled,
  error,
}: {
  id?: string;
  selection: IndustrySelection;
  custom: string;
  onSelectionChange: (next: IndustrySelection) => void;
  onCustomChange: (next: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const showCustom = selection === OTHER_INDUSTRY;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Business type{required ? " *" : ""}</Label>
        <select
          id={id}
          disabled={disabled}
          required={required && !showCustom}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground dark:bg-input/30"
          value={selection}
          onChange={(event) => {
            const next = event.target.value as IndustrySelection;
            onSelectionChange(next);
            if (next !== OTHER_INDUSTRY) {
              onCustomChange("");
            }
          }}
        >
          <option value="">
            {required ? "Select business type" : "Select if you want"}
          </option>
          {STANDARD_INDUSTRIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value={OTHER_INDUSTRY}>{OTHER_INDUSTRY}</option>
        </select>
      </div>

      {showCustom ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-custom`}>
            Please specify your business type *
          </Label>
          <Input
            id={`${id}-custom`}
            value={custom}
            disabled={disabled}
            required={required}
            minLength={2}
            maxLength={INDUSTRY_MAX_LENGTH}
            placeholder="e.g. Solar Installation"
            className="h-11"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onCustomChange(event.target.value)}
          />
        </div>
      ) : null}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
