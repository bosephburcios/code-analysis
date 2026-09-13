"use client";

import { useState, type ComponentProps } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { passwordStrength } from "@/lib/password-strength";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "id"> & { id: string; value: string };
const labels = ["Not entered", "Weak", "Fair", "Strong", "Very strong"];
const colors = ["bg-muted", "bg-red-500", "bg-amber-500", "bg-lime-600 dark:bg-lime-500", "bg-emerald-600 dark:bg-emerald-500"];

export function PasswordInput({ id, value, disabled, "aria-describedby": describedBy, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const score = passwordStrength(value);
  const hintsId = `${id}-guidance`;
  const strengthId = `${id}-strength`;
  const checks = [
    { label: "At least 8 characters (required)", met: value.length >= 8 },
    { label: "12 or more characters recommended", met: value.length >= 12 },
  ];

  return <div className="space-y-3">
    <div className="relative">
      <Input {...props} id={id} value={value} disabled={disabled} type={visible ? "text" : "password"} className="pr-10" aria-describedby={[describedBy, hintsId, strengthId].filter(Boolean).join(" ")} />
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} className="absolute right-1 top-1/2 -translate-y-1/2" aria-label={visible ? "Hide password" : "Show password"} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}>
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </Button>
    </div>
    <div className="space-y-2">
      <div role="meter" aria-label="Estimated password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={score} aria-valuetext={labels[score]} className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map(segment => <span key={segment} className={`h-1 rounded-full transition-colors ${score >= segment ? colors[score] : "bg-muted"}`} />)}
      </div>
      <p id={strengthId} role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground">{value ? `Estimated strength: ${labels[score]}` : "Enter a password to check its strength."}</p>
    </div>
    <div id={hintsId} className="space-y-2 text-xs text-muted-foreground">
      <ul className="space-y-1.5">{checks.map(check => <li key={check.label} className="flex items-center gap-2">
        {check.met ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
        <span className="sr-only">{check.met ? "Met: " : "Not yet met: "}</span>{check.label}
      </li>)}</ul>
      <p>Use a long, unique password or passphrase. Avoid common words and repeated patterns.</p>
    </div>
  </div>;
}
