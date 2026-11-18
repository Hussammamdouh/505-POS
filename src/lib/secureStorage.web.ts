export const secureGet = async (key: string) => globalThis.localStorage?.getItem(key) ?? null;

export const secureSet = async (key: string, value: string) => globalThis.localStorage?.setItem(key, value);

export const secureDelete = async (key: string) => globalThis.localStorage?.removeItem(key);
