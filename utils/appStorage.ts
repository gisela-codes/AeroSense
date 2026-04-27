import AsyncStorage from "@react-native-async-storage/async-storage";

const memoryStorage = new Map<string, string>();

const getLocalStorage = () => {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }

  return null;
};

export const appStorage = {
  getItem: async (key: string) => {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        memoryStorage.set(key, value);
      }
      return value;
    } catch {
      const localStorageRef = getLocalStorage();
      if (localStorageRef) {
        return localStorageRef.getItem(key);
      }

      return memoryStorage.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    memoryStorage.set(key, value);

    try {
      await AsyncStorage.setItem(key, value);
      return;
    } catch {
      const localStorageRef = getLocalStorage();
      if (localStorageRef) {
        localStorageRef.setItem(key, value);
      }
    }
  },
  removeItem: async (key: string) => {
    memoryStorage.delete(key);

    try {
      await AsyncStorage.removeItem(key);
      return;
    } catch {
      const localStorageRef = getLocalStorage();
      if (localStorageRef) {
        localStorageRef.removeItem(key);
      }
    }
  },
};
