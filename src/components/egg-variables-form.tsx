import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type EggVar = {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  user_viewable: boolean;
  user_editable: boolean;
  rules: string;
};

/** Pulls `in:a,b,c` choices out of a Pterodactyl rules string. */
function parseChoices(rules: string): string[] | null {
  const m = rules.match(/(?:^|\|)in:([^|]+)/i);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}
function isNumeric(rules: string) {
  return /(?:^|\|)(?:numeric|integer)(?:\||$)/i.test(rules);
}
function isLongText(env: string) {
  return /MODS?|MOD_LIST|WORKSHOP|ADDITIONAL_ARGS|EXTRA_ARGS|JAVA_ARGS/i.test(env);
}

export function EggVariablesForm({
  variables,
  values,
  onChange,
  disabled,
}: {
  variables: EggVar[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}) {
  if (variables.length === 0) {
    return <p className="text-sm text-muted-foreground">This server has no configurable variables.</p>;
  }

  const set = (k: string, v: string) => onChange({ ...values, [k]: v });

  return (
    <div className="grid gap-4">
      {variables.map((v) => {
        const value = values[v.env_variable] ?? v.default_value ?? "";
        const choices = parseChoices(v.rules);
        const editable = v.user_editable !== false && !disabled;
        const id = `var-${v.env_variable}`;

        return (
          <div key={v.env_variable} className="space-y-1.5">
            <Label htmlFor={id} className="flex flex-wrap items-baseline gap-2">
              <span>{v.name}</span>
              <code className="text-[10px] text-muted-foreground font-mono">{v.env_variable}</code>
              {!editable && <span className="text-[10px] text-muted-foreground">(read-only)</span>}
            </Label>
            {choices ? (
              <Select value={value} onValueChange={(val) => set(v.env_variable, val)} disabled={!editable}>
                <SelectTrigger id={id}><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {choices.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : isLongText(v.env_variable) ? (
              <Textarea
                id={id}
                value={value}
                onChange={(e) => set(v.env_variable, e.target.value)}
                disabled={!editable}
                placeholder={v.default_value}
                className="font-mono text-sm min-h-[80px]"
              />
            ) : (
              <Input
                id={id}
                type={isNumeric(v.rules) ? "number" : "text"}
                value={value}
                onChange={(e) => set(v.env_variable, e.target.value)}
                disabled={!editable}
                placeholder={v.default_value}
              />
            )}
            {v.description && (
              <p className="text-xs text-muted-foreground">{v.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
