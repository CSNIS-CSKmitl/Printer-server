import type { AppPocketBase } from "../../pocketbase";
import { calculateSnapshot } from "./calculateSnapshot";
import { getDefaultPackage } from "./getDefaultPackage";
import type { QuotaRow, QuotaSnapshot } from "./types";

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

export async function resetToDefault(
  pb: AppPocketBase,
  userId: string,
): Promise<QuotaSnapshot> {
  let row: QuotaRow;

  try {
    row = await pb
      .collection("Quota")
      .getFirstListItem<QuotaRow>(`user="${userId}"`, {
        expand: "Total_Quota",
      });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;

    const defaultPkg = await getDefaultPackage(pb);
    const newRow = await pb.collection("Quota").create<QuotaRow>(
      {
        user: [userId],
        Total_Quota: [defaultPkg.id],
        Add_Quota: 0,
        Use: 0,
      },
      { expand: "Total_Quota" },
    );

    return calculateSnapshot(newRow);
  }

  // Reset เฉพาะยอดใช้และโบนัสส่วนตัว โดยคงแพ็กเกจโควต้าหลักเดิมไว้
  const updatedRow = await pb.collection("Quota").update<QuotaRow>(
    row.id,
    {
      Add_Quota: 0,
      Use: 0,
    },
    { expand: "Total_Quota" },
  );

  return calculateSnapshot(updatedRow);
}
