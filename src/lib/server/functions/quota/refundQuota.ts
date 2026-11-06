import type { AppPocketBase } from "../../pocketbase";
import { getAdminClient } from "../pocketbase/getAdminClient";
import { calculateSnapshot } from "./calculateSnapshot";
import type { QuotaRow, QuotaSnapshot } from "./types";
import { getQuota } from "./getQuota";

export async function refundQuota(
  pb: AppPocketBase,
  userId: string,
  pages: number,
): Promise<QuotaSnapshot> {
  if (pages <= 0) return getQuota(pb, userId);
  try {
    const adminPb = await getAdminClient();
    const row = await adminPb
      .collection("Quota")
      .getFirstListItem<QuotaRow>(`user="${userId}"`, {
        expand: "Total_Quota",
      });
    const updatedRow = await adminPb.collection("Quota").update<QuotaRow>(
      row.id,
      {
        Use: Math.max(0, row.Use - pages),
      },
      { expand: "Total_Quota" },
    );
    return calculateSnapshot(updatedRow);
  } catch {
    return getQuota(pb, userId);
  }
}
