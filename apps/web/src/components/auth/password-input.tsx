"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@roundcut/ui/components/input-group";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useCallback, useState } from "react";

export function PasswordInput({
  showLabel,
  hideLabel,
  ...props
}: Omit<ComponentProps<typeof InputGroupInput>, "type"> & {
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const toggleVisible = useCallback(
    () => setVisible((current) => !current),
    []
  );

  return (
    <InputGroup className="w-full">
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="text-muted-foreground"
          onClick={toggleVisible}
          size="icon-xs"
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" />
          ) : (
            <EyeIcon aria-hidden="true" />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
