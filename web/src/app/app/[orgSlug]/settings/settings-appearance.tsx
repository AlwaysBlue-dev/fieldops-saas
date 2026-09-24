"use client";

import { Button } from "@/components/ui/button";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function SettingsAppearance() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-11 rounded-md bg-muted" aria-hidden />;
  }

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => {
        const active = (theme ?? "system") === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "default" : "outline"}
            className="h-11 md:h-8"
            aria-checked={active}
            role="radio"
            onClick={() => setTheme(option.value)}
          >
            <option.icon className="size-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
