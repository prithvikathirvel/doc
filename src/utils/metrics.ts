type CounterMap = Record<string, number>;

const counters: CounterMap = {
  upload_count: 0,
  download_count: 0,
  delete_count: 0,
  upload_failures: 0,
  download_failures: 0,
  storage_failures: 0,
  processing_failures: 0,
};

const latencies: Record<string, number[]> = {
  upload_latency_ms: [],
  download_latency_ms: [],
  storage_operation_latency_ms: [],
};

function pushLatency(name: string, value: number): void {
  const bucket = latencies[name] || [];
  bucket.push(value);
  if (bucket.length > 500) {
    bucket.shift();
  }
  latencies[name] = bucket;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export const metrics = {
  inc(name: keyof typeof counters, by = 1): void {
    counters[name] = (counters[name] || 0) + by;
  },
  observeUpload(durationMs: number, success: boolean): void {
    if (success) metrics.inc("upload_count");
    else metrics.inc("upload_failures");
    pushLatency("upload_latency_ms", durationMs);
  },
  observeDownload(durationMs: number, success: boolean): void {
    if (success) metrics.inc("download_count");
    else metrics.inc("download_failures");
    pushLatency("download_latency_ms", durationMs);
  },
  observeStorage(durationMs: number, success: boolean): void {
    if (!success) metrics.inc("storage_failures");
    pushLatency("storage_operation_latency_ms", durationMs);
  },
  snapshot(): Record<string, unknown> {
    return {
      counters: { ...counters },
      latency: Object.fromEntries(
        Object.entries(latencies).map(([key, values]) => [
          key,
          { count: values.length, p50: percentile(values, 50), p95: percentile(values, 95) },
        ])
      ),
    };
  },
};
