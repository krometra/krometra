import { account } from "./account";
import { auth } from "./auth";
import { common } from "./common";
import { validation } from "./validation";

export const ru = { ...common, ...auth, ...account, ...validation };
