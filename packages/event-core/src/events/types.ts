import type { ProtocolConfig, TaskDescriptor } from "@dynamic/shared-workflow";
import type { DomainEventEnvelope } from "../types";

export interface BaseEventInput {
  event_id: string;
  site_id: number;
  locality_code: string;
  household_id: string;
  recorded_at: string;
  event_date?: string;
  task_id?: string | null;
  task_key?: string | null;
  form_response_id?: string | null;
  device_id?: string | null;
  user_id?: string | null;
  apply_status?: DomainEventEnvelope["apply_status"];
  rules_version?: string;
}

export interface EventPromotionResult<TPayload = Record<string, unknown>> {
  event: DomainEventEnvelope<TPayload>;
  task_descriptors: TaskDescriptor[];
  projection?: unknown;
  data_quality_flags: Array<{
    flag_type: string;
    source_event_id: string;
    message: string;
  }>;
}

export interface EventModule<TInput, TPayload = Record<string, unknown>> {
  EVENT_TYPE: string;
  buildEvent(input: TInput): DomainEventEnvelope<TPayload>;
  reduceEvent(input: { event: DomainEventEnvelope<TPayload>; current?: unknown }): unknown;
  planWorkflow(input: {
    event: DomainEventEnvelope<TPayload>;
    config?: ProtocolConfig;
  }): TaskDescriptor[];
  promoteEvidence(input: TInput & { config?: ProtocolConfig }): EventPromotionResult<TPayload>;
}
