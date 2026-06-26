/* server/db.js — Shared store instance + typed accessors for the backend. */
const config = require("./config");
const createStore = require("./store");

const store = createStore(config.dataDir);

module.exports = {
  users: () => store.read("users", {}),
  sessions: () => store.read("sessions", {}),
  progress: () => store.read("progress", {}),
  commitUsers: () => store.commit("users"),
  commitSessions: () => store.commit("sessions"),
  commitProgress: () => store.commit("progress"),
};
