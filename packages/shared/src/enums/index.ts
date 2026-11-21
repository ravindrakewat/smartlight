export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export enum HealthStatus {
  Ok = 'ok',
  Degraded = 'degraded',
  Error = 'error',
}

export enum ApplicationId {
  Api = 'api',
  CitizenWeb = 'citizen-web',
  MunicipalAdmin = 'municipal-admin',
  SuperAdmin = 'super-admin',
  Mobile = 'mobile',
}
