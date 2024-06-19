import JSON5 from "json5";
import { resolvePresets } from "graphile-config";
import { Worker } from "node:worker_threads";
import * as os from "node:os";
import {
  CheckDocumentRequest,
  CheckDocumentOutput,
  WorkerData,
  SourceLike,
  SourceResultsBySourceName,
  CheckOperationsResult,
  Baseline,
} from "./interfaces";
import { loadConfig } from "graphile-config/load";
import { readFile } from "node:fs/promises";
import { filterBaseline } from "./baseline";

type Deferred<T> = Promise<T> & {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
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
    const handleResponse = (message: any) => {
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

  const results: SourceResultsBySourceName = Object.create(null);
  const operationKindByOperationName = new Map<string, string>();
  for (const { request, result } of allResults) {
    const { sourceName, sourceString } = request;
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
      sourceString,
      output: result,
    };
  }

  releaseWorkers();

  return {
    // TODO: counters: documents, operations, fragments, fields, arguments
    rawResultsBySourceName: results,
    resultsBySourceName: baseline ? filterBaseline(baseline, results) : results,
    baseline,
    resolvedPreset: config,
  };
}
