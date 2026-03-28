import { Outlet } from "react-router-dom";

export default function SettingsLayout() {
  return (
    <div className="settings-content min-w-0">
      <Outlet />
    </div>
  );
}
