import { auth } from "./auth";
import { common } from "./common";
import { validation } from "./validation";

export const ru = { ...common, ...auth, ...validation };
