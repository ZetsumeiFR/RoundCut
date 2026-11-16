import {
  SETTING_ROWS,
  SettingsSkeleton,
} from "@/components/account/settings-skeleton";

export default function WorkspaceLoading() {
  return <SettingsSkeleton rows={SETTING_ROWS.workspace} />;
}
