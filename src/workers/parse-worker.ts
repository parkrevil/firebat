import { parseSync } from 'oxc-parser';

declare var self: Worker;

interface ParseWorkerRequest {
  readonly filePath: string;
}

interface ParseWorkerResponseOk {
  readonly ok: true;
  readonly filePath: string;
  readonly sourceText: string;
  readonly program: unknown;
  readonly errors: ReadonlyArray<unknown>;
}

interface ParseWorkerResponseFail {
  readonly ok: false;
  readonly filePath: string;
  readonly error: string;
}

const extractFilePath = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const maybeFilePath = (data as { filePath?: unknown }).filePath;

  if (typeof maybeFilePath !== 'string') {
    return null;
  }

  if (maybeFilePath.trim().length === 0) {
    return null;
  }

  return maybeFilePath;
};

const toCloneableError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;

    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  return String(error);
};

self.onmessage = async (event: MessageEvent<ParseWorkerRequest>) => {
  const filePath = extractFilePath((event as unknown as { data?: unknown })?.data);

  if (filePath === null) {
    const response: ParseWorkerResponseFail = {
      ok: false,
      filePath: '',
      error: 'invalid filePath',
    };

    postMessage(response);

    return;
  }

  try {
    const sourceText = await Bun.file(filePath).text();
    const parsed = parseSync(filePath, sourceText);
    const response: ParseWorkerResponseOk = {
      ok: true,
      filePath,
      sourceText,
      program: parsed.program,
      errors: Array.isArray(parsed.errors) ? parsed.errors.map(toCloneableError) : [],
    };

    postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ParseWorkerResponseFail = { ok: false, filePath, error: message };

    postMessage(response);
  }
};
