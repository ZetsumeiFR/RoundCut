import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { CircleAlertIcon } from "lucide-react";

export function AuthErrorAlert({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
