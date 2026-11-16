import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSeparator,
} from "@roundcut/ui/components/field";
import type { ReactNode } from "react";

export function SettingRow({
  children,
  description,
  errors,
  labelFor,
  last,
  title,
}: {
  children: ReactNode;
  description: string;
  errors?: Array<{ message?: string } | undefined>;
  labelFor: string;
  last?: boolean;
  title: string;
}) {
  const invalid = (errors?.length ?? 0) > 0;
  return (
    <>
      <Field
        className="gap-4 px-5 py-3"
        data-invalid={invalid}
        orientation="responsive"
      >
        <div className="flex min-w-0 @md/field-group:max-w-sm flex-1 flex-col gap-0.5">
          <FieldLabel htmlFor={labelFor}>{title}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </div>
        <FieldContent className="@md/field-group:w-78 min-w-0">
          {children}
          <FieldError errors={errors} />
        </FieldContent>
      </Field>
      {last ? null : <FieldSeparator />}
    </>
  );
}
