export const CONTROL_VERSION = 1;
export const CONTROL_READY_EVENT = "cad-control-ready";

export type ControlErrorCode =
  | "unknown_op"
  | "invalid_params"
  | "not_ready"
  | "busy"
  | "wrong_mode"
  | "not_found"
  | "operation_failed";

export interface ControlRequest {
  op: string;
  params?: Record<string, unknown>;
}

export type ControlReply =
  | { ok: true; op: string; result: unknown }
  | { ok: false; op: string; error: { code: ControlErrorCode; message: string } };

export interface ControlChannel {
  version: typeof CONTROL_VERSION;
  ready: Promise<void>;
  request(req: ControlRequest): Promise<ControlReply>;
}

export type ControlParamType = "string" | "number" | "integer" | "boolean" | "array" | "object";

export interface ControlParamDescriptor {
  type: ControlParamType;
  required: boolean;
  description: string;
}

export interface ControlOpDescriptor {
  op: string;
  description: string;
  mutates: boolean;
  params: Record<string, ControlParamDescriptor>;
}

export interface ControlCapabilities {
  version: typeof CONTROL_VERSION;
  ops: ControlOpDescriptor[];
}

export class ControlError extends Error {
  constructor(
    readonly code: ControlErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ControlError";
  }
}

export function fail(code: ControlErrorCode, message: string): ControlError {
  return new ControlError(code, message);
}
