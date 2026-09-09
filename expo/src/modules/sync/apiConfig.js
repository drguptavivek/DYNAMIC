// Release APKs must always target the production API. Development builds may
// override the endpoint through EXPO_PUBLIC_API_BASE_URL for local testing.
export const API_BASE_URL = __DEV__
  ? process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3310/api/v1"
  : "https://dynamicstudyindia.com/api/v1";
