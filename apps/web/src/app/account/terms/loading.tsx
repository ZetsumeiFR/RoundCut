import {
  SETTING_ROWS,
  SettingsSkeleton,
} from "@/components/account/settings-skeleton";

export default function TermsLoading() {
  return <SettingsSkeleton rows={SETTING_ROWS.terms} />;
}
