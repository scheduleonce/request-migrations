import { Request } from "express";
import { Migration } from "@lib";
import { singleCallWrapper } from "./single-call";
import path from "node:path";
const filename = path.parse(__filename).name;

const migration: Migration = {
  path: "/api/users/:id",
  verbs: "POST|GET",
  version: "2023-06-15",
  description: "Split user name to first and last name",
  migrateRequest: singleCallWrapper(async (req: Request) => {
    if (
      req.body.user &&
      req.body.user.name &&
      !req.body.user.firstName &&
      !req.body.user.lastName
    ) {
      const [firstName, lastName] = req.body.user.name.split(" ", 2);
      req.body.user.firstName = firstName;
      req.body.user.lastName = lastName || "";
      delete req.body.user.name;
    }

    return req;
  }, `${filename}:migrateRequest`),
  migrateResponse: singleCallWrapper(async (req: Request, body: any) => {
    if (body.user.firstName && body.user.lastName) {
      body.user.name = `${body.user.firstName} ${body.user.lastName}`;
      delete body.user.firstName;
      delete body.user.lastName;
    }

    return body;
  }, `${filename}:migrateResponse`),
};

export default migration;
