export interface StyleViolation {
  ruleId: string;
  message: string;
  file: string;
  line?: number;
  column?: number;
}
