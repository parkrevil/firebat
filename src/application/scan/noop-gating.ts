export type ExceptionHygieneStatus = 'ok' | 'unavailable' | 'failed';

export const shouldIncludeNoopEmptyCatch = (input: {
  readonly exceptionHygieneSelected: boolean;
  readonly exceptionHygieneStatus?: ExceptionHygieneStatus;
}): boolean => {
  if (!input.exceptionHygieneSelected) {
    return true;
  }

  return input.exceptionHygieneStatus !== 'ok';
};
