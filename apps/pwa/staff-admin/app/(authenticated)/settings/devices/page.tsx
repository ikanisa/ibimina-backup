import { DeviceList } from "@/components/settings/device-list";
import { Separator } from "@/components/ui/separator";

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Trusted Devices</h3>
        <p className="text-sm text-muted-foreground">
          Manage devices that are authorized to access your account.
        </p>
      </div>
      <Separator />
      <DeviceList />
    </div>
  );
}
