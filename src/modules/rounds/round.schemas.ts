import { z } from "zod";
import { emptyable, positiveId } from "@src/core/validation/common";

export const startRoundBody = z.object({
  recurringConfigId: emptyable(positiveId),
});
