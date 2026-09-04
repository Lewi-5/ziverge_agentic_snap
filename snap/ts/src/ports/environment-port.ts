export interface EnvironmentPort {
  readonly getEnv: (name: string) => string | undefined;
}
