import express, { Express } from "express";
import http from "http";

export interface TestExpress extends Express {
  start: () => Promise<http.Server>;
  url: () => string;
  stop: () => void;
  makeRequest: (
    baseUrl: string,
    method: string,
    path: string,
    headers?: Record<string, string>,
    body?: any
  ) => Promise<{ statusCode: number; body: any }>;
}

export const createTestServer = () => {
  const app = express() as TestExpress;
  let server: http.Server;
  let port: number;

  app.use(express.json());

  app.start = async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to start server"));
          return;
        }
        port = addr.port;
        resolve();
      });
    });
    return server;
  };

  app.url = () => {
    if (!port) {
      throw new Error("Server not started");
    }
    return `http://localhost:${port}`;
  };

  app.stop = () => {
    if (server) {
      server.close();
    }
  };

  app.makeRequest = async (
    baseUrl: string,
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any
  ) => {
    const url = `${baseUrl}${path}`;
    const options: RequestInit = {
      method: method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => response.text());
    return { statusCode: response.status, body: data };
  };

  return app;
};
