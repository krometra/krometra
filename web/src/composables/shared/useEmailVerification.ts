import { createSharedComposable } from "@vueuse/core";
import { createEmailVerification } from "@/composables/account/emailVerification";
import { useApi } from "@/composables/useApi";
import { useAuth } from "./useAuth";

export const useEmailVerification = createSharedComposable(() => createEmailVerification(useApi(), useAuth()));
