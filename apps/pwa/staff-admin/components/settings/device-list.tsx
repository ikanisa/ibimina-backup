"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Smartphone, Laptop } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface TrustedDevice {
  id: string;
  device_id: string;
  last_used_at: string;
  created_at: string;
  ip_prefix: string | null;
}

export function DeviceList() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Assuming 'trusted_devices' table exists based on audit
      const { data, error } = await supabase
        .from("trusted_devices")
        .select("*")
        .eq("user_id", user.id)
        .order("last_used_at", { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      console.error("Error fetching devices:", error);
      toast.error("Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase.from("trusted_devices").delete().eq("id", id);

      if (error) throw error;

      setDevices(devices.filter((d) => d.id !== id));
      toast.success("Device revoked successfully");
    } catch (error) {
      console.error("Error revoking device:", error);
      toast.error("Failed to revoke device");
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Smartphone className="mb-4 h-12 w-12 opacity-20" />
            <p>No trusted devices found.</p>
          </CardContent>
        </Card>
      ) : (
        devices.map((device) => (
          <Card key={device.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-muted p-2">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Device {device.device_id.substring(0, 8)}...</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Last active{" "}
                    {formatDistanceToNow(new Date(device.last_used_at), { addSuffix: true })}
                  </p>
                  {device.ip_prefix && (
                    <p className="text-xs text-muted-foreground">IP: {device.ip_prefix}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRevoke(device.id)}
                disabled={!!revokingId}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {revokingId === device.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
