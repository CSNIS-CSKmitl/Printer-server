import { getAdminClient } from "../pocketbase/getAdminClient";
import type { AppPocketBase } from "../../pocketbase";
import { calculateSnapshot } from "./calculateSnapshot";
import { getDefaultPackage } from "./getDefaultPackage";
import type { QuotaRow, QuotaSnapshot } from "./types";

export async function getQuota(
  pb: AppPocketBase,
  userId: string,
): Promise<QuotaSnapshot> {
  const adminPb = await getAdminClient();
  // Read the owner's quota with the request client when the optional service
  // credentials are not configured. Writes still require the server admin
  // client below, so this fallback does not grant users write access.
  const readPb = adminPb.authStore.isValid ? adminPb : pb;
  try {
    const row = await readPb
      .collection("Quota")
      .getFirstListItem<QuotaRow>(`user="${userId}"`, {
        expand: "Total_Quota", // ขยาย Relation
      });
    return calculateSnapshot(row);
  } catch {
    // ถ้าไม่เคยมีข้อมูล สร้างข้อมูลใหม่ลงในตาราง Quota
    try {
      const defaultPkg = await getDefaultPackage(pb);
      const newRow = await adminPb.collection("Quota").create<QuotaRow>(
        {
          user: [userId],
          Total_Quota: [defaultPkg.id],
          Add_Quota: 0,
          Use: 0,
        },
        { expand: "Total_Quota" },
      );
      return calculateSnapshot(newRow);
    } catch (createErr) {
      console.error(
        "[Quota] Failed to create default quota for user:",
        userId,
        createErr,
      );
      throw new Error("ไม่สามารถสร้างสิทธิ์พิมพ์งานได้ กรุณาติดต่อ Bornzi");
    }
  }
}
