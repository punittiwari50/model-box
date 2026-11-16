import { useState, useCallback, useRef } from "react";

export interface UseIdempotentActionOptions<TReq, TRes> {
  readonly endpoint: string;
  readonly method?: "POST" | "PUT" | "PATCH" | "DELETE";
  readonly transformPayload?: (payload: TReq) => unknown;
  readonly onSuccess?: (data: TRes) => void;
  readonly onError?: (error: Error) => void;
  readonly debounceMs?: number;
}

export function useIdempotentAction<TReq, TRes>(
  options: UseIdempotentActionOptions<TReq, TRes>,
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastClickRef = useRef<number>(0);

  const execute = useCallback(
    async (payload: TReq): Promise<TRes | undefined> => {
      const now = Date.now();
      const debounceWindow = options.debounceMs ?? 300;

      // Client-side debounce protection
      if (now - lastClickRef.current < debounceWindow || isSubmitting) {
        return;
      }
      lastClickRef.current = now;

      setIsSubmitting(true);
      setError(null);

      // Generate UUIDv4 idempotency key
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      try {
        const response = await fetch(options.endpoint, {
          method: options.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(options.transformPayload ? options.transformPayload(payload) : payload),
        });

        const data = await response.json();

        if (!response.ok || (data && data.success === false)) {
          const message =
            data?.error?.message ||
            `HTTP ${response.status}: Action rejected by server`;
          throw new Error(message);
        }

        options.onSuccess?.(data);
        return data as TRes;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Action execution failed";
        setError(errMsg);
        options.onError?.(new Error(errMsg));
        return undefined;
      } finally {
        setIsSubmitting(false);
      }
    },
    [options, isSubmitting],
  );

  return { execute, isSubmitting, error };
}
