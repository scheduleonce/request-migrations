import { Migration } from "@lib";
import { Request } from "express";

const migration: Migration = {
  path: "/api/users/:id",
  verbs: "POST",
  version: "2023-01-01",
  description: "This is a bad migration",
  migrateRequest: async (req: Request) => {
    throw new Error("This migration intentionally throws an error");
  },
  migrateResponse: async (req: Request, body: any) => {
    return body;
  },
};

export default migration;
