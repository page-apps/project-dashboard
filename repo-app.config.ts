import { defineRepoApp } from "@repo-apps/runtime";

export default defineRepoApp({
  id: "project-dashboard",
  title: "GitHub Dashboard",
  repository: {
    mode: "self",
    branch: "main",
    dataRoot: "data",
  },
  repositoryScope: "pat-authorized",
  auth: {
    methods: ["pat"],
    persistence: "optional-persistent",
    sharedCredential: true,
  },
  demo: {
    fixture: "./demo/dashboard.json",
  },
  writes: {
    defaultStrategy: "direct",
    conflictStrategy: "prompt",
  },
});
