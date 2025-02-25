import { Migration } from "@lib";
import { Request } from "express";

const migration: Migration = {
  path: "/api/users/:id",
  verbs: "POST",
  version: "2024-01-01",
  description: "This is a bad migration",
  migrateRequest: async (req: Request) => {
    return req;
  },
  migrateResponse: async (req: Request, body: any) => {
    throw new Error("This migration intentionally throws an error");
  },
};

export default migration;
