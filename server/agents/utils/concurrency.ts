/**
 * 通用并发控制工具
 *
 * 多个 LLM 调用并行时会同时占用大量请求并容易拖垮 Serverless 函数时长，
 * 用固定并发上限逐个执行，超出的任务排队等待。
 */

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );
  return results;
}
