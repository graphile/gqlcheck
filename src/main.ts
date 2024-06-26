import { readFile } from "node:fs/promises";
import * as os from "node:os";
import { Worker } from "node:worker_threads";

import { resolvePresets } from "graphile-config";
import { loadConfig } from "graphile-config/load";
import JSON5 from "json5";

import { filterBaseline } from "./baseline.js";
import type {
  Baseline,
  CheckDocumentCounts,
  CheckDocumentOutput,
  CheckDocumentRequest,
  CheckOperationsResult,
  SourceLike,
  SourceResultsBySourceName,
  WorkerData,
} from "./interfaces.js";

type Deferred<T> = Promise<T> & {
  resolve: (value: T | PromiseLike<T>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (reason?: any) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reject!: (reason?: any) => void;
  return Object.assign(
    new Promise<T>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    }),
    { resolve, reject },
  );
}

async function loadBaseline(
  baselinePath: string | undefined,
): Promise<Baseline | null> {
  if (baselinePath == null) {
    return null;
  }
  try {
    const data = await readFile(baselinePath, "utf8");
    // TODO: safer casting
    return JSON5.parse(data) as Baseline;
  } catch (e) {
    if (
      typeof e === "object" &&
      e != null &&
      "code" in e &&
      e.code === "ENOENT"
    ) {
      return null;
    }
    throw new Error(
      `Failed to load baseline from configured '${baselinePath}'`,
      { cause: e },
    );
  }
}

export async function checkOperations(
  getDocuments: () => AsyncIterable<string | SourceLike>,
  configPath?: string,
  overrideConfig?: GraphileConfig.Preset["gqlcheck"],
): Promise<CheckOperationsResult> {
  const rawConfig = await loadConfig(configPath);
  const config = resolvePresets([
    rawConfig ?? {},
    { gqlcheck: overrideConfig },
  ]);
  const { gqlcheck: { baselinePath, workerCount = os.cpus().length } = {} } =
    config;
  const baseline = await loadBaseline(baselinePath);
  const workerPromises: Promise<Worker>[] = [];
  const handleError = (_worker: Worker, error: Error) => {
    console.error(`Worker exited with error: ${error}`);
    process.exit(2);
  };
  for (let i = 0; i < workerCount; i++) {
    const deferred = defer<Worker>();
    const workerNumber = i;
    const workerData: WorkerData = {
      configPath,
      overrideConfig,
    };
    const worker = new Worker(`${__dirname}/worker.js`, {
      workerData,
    });
    worker.on("error", (error) => {
      worker.terminate();
      handleError(worker, error);
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        handleError(
          worker,
          new Error(`Worker ${workerNumber} stopped with exit code ${code}`),
        );
      }
    });
    workerPromises[i] = deferred;
    worker.once("message", (msg) => {
      if (msg === "READY") {
        deferred.resolve(worker);
      } else {
        console.error(`Received unexpected response: %O`, msg);
        process.exit(3);
      }
    });
  }

  const workers = await Promise.all(workerPromises);

  const freeWorkers = [...workers];
  const queue: Deferred<Worker>[] = [];
  let workersActive = true;

  function releaseWorker(worker: Worker) {
    workers.splice(workers.indexOf(worker), 1);
    worker.postMessage("STOP");
  }

  function _getFreeWorker() {
    const worker = freeWorkers.pop();
    if (worker) {
      return worker;
    } else {
      const promise = defer<Worker>();
      queue.push(promise);
      return promise;
    }
  }

  function _returnWorker(worker: Worker) {
    const waiting = queue.pop();
    if (waiting) {
      waiting.resolve(worker);
    } else if (!workersActive) {
      releaseWorker(worker);
    } else {
      freeWorkers.push(worker);
    }
  }

  function releaseWorkers() {
    workersActive = false;
    const workersToRelease = freeWorkers.splice(0, freeWorkers.length);
    for (const worker of workersToRelease) {
      releaseWorker(worker);
    }
  }

  interface Task<TRequest, TResult> {
    request: TRequest;
    resultPromise: Promise<TResult>;
  }

  async function startWorkerTask<TRequest, TResult>(
    request: TRequest,
  ): Promise<Task<TRequest, TResult>> {
    const resultPromise = defer<TResult>();
    const worker = await _getFreeWorker();
    const handleResponse = (message: TResult) => {
      worker.off("message", handleResponse);
      _returnWorker(worker);
      resultPromise.resolve(message);
    };
    worker.on("message", handleResponse);
    worker.postMessage(request);
    return { request, resultPromise };
  }

  const startedTasks: Task<CheckDocumentRequest, CheckDocumentOutput>[] = [];
  let index = -1;
  const sourceNames = new Set<string>();

  // In this loop the `await` is just for _starting_ a task, this gives us flow
  // control (so we don't request more data than we have workers to handle, but
  // we still make sure that all workers are busy). This is why we push a
  // promise onto the list.
  for await (const source of getDocuments()) {
    index++;
    const sourceName = typeof source === "string" ? String(index) : source.name;
    if (sourceNames.has(sourceName)) {
      throw new Error(
        `Source name '${sourceName}' has been used more than once, source names must be unique.`,
      );
    } else {
      sourceNames.add(sourceName);
    }
    const sourceString = typeof source === "string" ? source : source.body;
    const task = await startWorkerTask<
      CheckDocumentRequest,
      CheckDocumentOutput
    >({
      sourceName,
      sourceString,
    });
    startedTasks.push(task);
  }

  // Now that all the tasks have been started, we wait for them all to
  // complete.
  const allResults: Array<{
    request: CheckDocumentRequest;
    result: CheckDocumentOutput;
  }> = [];
  for (const task of startedTasks) {
    const request = task.request;
    const result = await task.resultPromise;
    if (result.sourceName !== request.sourceName) {
      throw new Error(
        `Internal consistency error: the result we received from the worker was for source '${result.sourceName}', but the request was for '${request.sourceName}'`,
      );
    }
    allResults.push({ request, result });
  }

  releaseWorkers();

  const results: SourceResultsBySourceName = Object.create(null);
  const operationKindByOperationName = new Map<string, string>();
  const counts: Exclude<CheckDocumentOutput["meta"]["count"], undefined> =
    Object.create(null);
  for (const { request, result } of allResults) {
    const { sourceName } = request;
    const { operations } = result;
    for (const operation of operations) {
      const { operationName, operationKind } = operation;
      if (!operationName) continue;
      const expectedOperationKind =
        operationKindByOperationName.get(operationName);
      if (!expectedOperationKind) {
        operationKindByOperationName.set(operationName, operationKind);
      } else if (expectedOperationKind !== operationKind) {
        throw new Error(
          `Named operation '${operationName}' previously existed with operation type '${expectedOperationKind}', but another operation with the same name now has type '${operationKind}'. This is forbidden.`,
        );
      } else {
        // All good
      }
    }
    results[sourceName] = {
      output: result,
    };
    if (result.meta.count) {
      for (const [key, value] of Object.entries(
        result.meta.count,
      ) as ReadonlyArray<[keyof CheckDocumentCounts, number]>) {
        if (counts[key] === undefined) {
          counts[key] = value;
        } else {
          counts[key] += value;
        }
      }
    }
  }

  let result: CheckOperationsResult = {
    rawResultsBySourceName: results,
    resultsBySourceName: results,
    baseline,
    resolvedPreset: config,
    counts,
    filtered: 0,
  };
  if (baseline) {
    result = filterBaseline(baseline, result);
  }
  return result;
}
