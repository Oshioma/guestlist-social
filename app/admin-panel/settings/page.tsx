import { createAdminClient } from "@/lib/supabase/admin";
import EngineThresholdsForm from "../components/EngineThresholdsForm";
import AutoApproveForm from "../components/AutoApproveForm";
import EngineNav from "../components/EngineNav";
import {
  getEngineThresholds,
  setEngineThresholds,
  DEFAULT_ENGINE_THRESHOLDS,
  ENGINE_BOUNDS,
  type EngineThresholds,
  getAutoApproveSettings,
  setAutoApproveSettings,
  type AutoApproveSettings,
} from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const adminClient = createAdminClient();
  const [engineSettings, autoApproveSettings] = await Promise.all([
    getEngineThresholds(adminClient),
    getAutoApproveSettings(adminClient),
  ]);

  const engineIsDefault = (Object.keys(DEFAULT_ENGINE_THRESHOLDS) as (keyof EngineThresholds)[]).every(
    (k) => engineSettings[k] === DEFAULT_ENGINE_THRESHOLDS[k]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background:
          "linear-gradient(180deg, #f6f7f8 0%, #f1f3f5 45%, #eef1f4 100%)",
        borderRadius: 20,
        padding: 14,
      }}
    >
      <EngineNav />
      <div
        style={{
          borderRadius: 24,
          border: "1px solid rgba(16,24,40,0.06)",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px rgba(16,24,40,0.05)",
          padding: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Settings
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#667085", maxWidth: 740 }}>
          Control how strict and automated the engine is.
        </p>
      </div>

      <div
        style={{
          borderRadius: 20,
          border: "1px solid rgba(16,24,40,0.06)",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px rgba(16,24,40,0.05)",
          padding: 18,
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Engine Thresholds
        </h3>
        <EngineThresholdsForm
          initial={engineSettings}
          bounds={ENGINE_BOUNDS}
          isDefault={engineIsDefault}
          onSave={async (values) => {
            "use server";
            const admin = createAdminClient();
            await setEngineThresholds(admin, values);
          }}
        />
      </div>

      <div
        style={{
          borderRadius: 20,
          border: "1px solid rgba(16,24,40,0.06)",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px rgba(16,24,40,0.05)",
          padding: 18,
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Auto Mode
        </h3>
        <AutoApproveForm
          initial={autoApproveSettings}
          onSave={async (values) => {
            "use server";
            const admin = createAdminClient();
            await setAutoApproveSettings(admin, values as AutoApproveSettings);
          }}
        />
      </div>

      <div
        style={{
          borderRadius: 20,
          border: "1px solid rgba(16,24,40,0.06)",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px rgba(16,24,40,0.05)",
          padding: 18,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
          How this works
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: "#667085", lineHeight: 1.6 }}>
          These settings control how aggressive or conservative the engine is.
          Lower thresholds produce more actions. Higher thresholds produce safer
          decisions.
        </p>
      </div>
    </div>
  );
}
