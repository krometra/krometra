import { computed, ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { ApiError, errorMessage, type FieldErrors } from "@/lib/apiError";
import type { MessageDescriptor } from "@/lib/i18n/catalog";

export function useFormErrors(fallback: MessageDescriptor) {
  const { tMessage } = useI18n();
  const issues = ref<Record<string, MessageDescriptor>>({});
  const serverFields = ref<FieldErrors>({});
  const failure = ref<{ cause: unknown } | null>(null);

  const fields = computed<FieldErrors>(() => {
    const translated: FieldErrors = {};
    for (const [field, issue] of Object.entries(issues.value)) translated[field] = tMessage(issue);
    return { ...translated, ...serverFields.value };
  });

  const summary = computed(() =>
    failure.value ? errorMessage(failure.value.cause, tMessage(fallback)) : "",
  );

  function validate(checks: Record<string, MessageDescriptor | null>): boolean {
    const found: Record<string, MessageDescriptor> = {};
    for (const [field, issue] of Object.entries(checks)) {
      if (issue) found[field] = issue;
    }
    issues.value = found;
    serverFields.value = {};
    failure.value = null;
    return Object.keys(found).length === 0;
  }

  function clearField(field: string) {
    const { [field]: _issue, ...restIssues } = issues.value;
    const { [field]: _serverError, ...restServerFields } = serverFields.value;
    issues.value = restIssues;
    serverFields.value = restServerFields;
  }

  function capture(error: unknown) {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
      serverFields.value = error.fields;
    } else {
      failure.value = { cause: error };
    }
  }

  return { fields, summary, validate, clearField, capture };
}
