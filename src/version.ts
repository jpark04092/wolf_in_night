declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;

export interface AppVersionInfo {
  version: string;
  buildTime: string;
  commitHash: string;
}

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';

export const BUILD_TIME =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Dev Mode';

export const COMMIT_HASH =
  typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'local';

export const VERSION_INFO: AppVersionInfo = {
  version: APP_VERSION,
  buildTime: BUILD_TIME,
  commitHash: COMMIT_HASH,
};
