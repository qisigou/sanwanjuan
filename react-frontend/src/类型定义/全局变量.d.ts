export {};

declare global {
  interface Window {
    __APP_CONFIG__: {
      API_BASE_URL: string;
      // 如果你以后还有别的配置，可以在这里继续添加
      // APP_NAME?: string;
      // APP_VERSION?: string;
    };
  }
}