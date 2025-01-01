import { Request } from "express";
import { Migration } from "@lib";
import { singleCallWrapper } from "./single-call";
import path from "node:path";
const filename = path.parse(__filename).name;

const migration: Migration = {
  path: "/api/users/:id",
  verbs: "POST|PUT",
  version: "2023-06-15",
  description: "Rename account_type field name to accountType",
  migrateRequest: singleCallWrapper(async (req: Request) => {
    if (req.body.user?.account_type) {
      req.body.user.accountType = req.body.user.account_type;
      delete req.body.user.account_type;
    }
    return req;
  }, `${filename}:migrateRequest`),
  migrateResponse: singleCallWrapper(async (req: Request, body: any) => {
    if (body.user?.accountType) {
      body.user.account_type = body.user.accountType;
      delete body.user.accountType;
    }
    return body;
  }, `${filename}:migrateResponse`),
};

export default migration;
