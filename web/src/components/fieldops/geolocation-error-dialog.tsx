"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GeolocationRequestError } from "@/lib/geolocation";

export function GeolocationErrorDialog({
  open,
  error,
  pending,
  onCancel,
  onRetry,
}: {
  open: boolean;
  error: GeolocationRequestError | null;
  pending?: boolean;
  onCancel: () => void;
  onRetry?: () => void;
}) {
  if (!error) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{error.title}</DialogTitle>
          <DialogDescription>{error.userMessage}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          {error.canRetry && onRetry ? (
            <Button
              type="button"
              className="h-11 md:h-8"
              disabled={pending}
              onClick={onRetry}
            >
              {pending ? "Getting your current location…" : "Try Again"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
