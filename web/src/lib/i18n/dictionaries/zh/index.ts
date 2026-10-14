import type { Translation } from "../../message";
import type { ru } from "../ru";
import { account } from "./account";
import { auth } from "./auth";
import { common } from "./common";
import { validation } from "./validation";

export const zh: Translation<typeof ru> = { ...common, ...auth, ...account, ...validation };
