import type { Translation } from "../../message";
import type { account as source } from "../ru/account";

export const account: Translation<typeof source> = {
  "account.title": "Account",
  "account.backToProjects": "My projects",
  "account.signedInAs": "Signed in as {email}",

  "account.keys.title": "AI access keys (MCP)",
  "account.keys.intro":
    "A key gives an AI assistant such as Claude Code access to your projects through the MCP server. It replaces your email and password in the assistant settings and can be revoked at any time without changing your password.",
  "account.keys.name.label": "Key name",
  "account.keys.name.placeholder": "For example, Claude Code on my laptop",
  "account.keys.name.required": "Enter a key name.",
  "account.keys.name.tooLong": {
    one: "The name must be at most {count} character.",
    other: "The name must be at most {count} characters.",
  },
  "account.keys.create": "Create key",
  "account.keys.createFailed": "Could not create the key.",
  "account.keys.limitReached": {
    one: "You have {count} key, which is the maximum. Delete one you no longer need to create a new one.",
    other: "You have {count} keys, which is the maximum. Delete one you no longer need to create a new one.",
  },
  "account.keys.loading": "Loading keys…",
  "account.keys.loadFailed": "Could not load the keys.",
  "account.keys.retry": "Retry",
  "account.keys.empty": "No keys yet. Create one to connect an assistant.",
  "account.keys.createdAt": "Created {date}",
  "account.keys.lastUsedAt": "Last used {date}",
  "account.keys.neverUsed": "Never used",
  "account.keys.delete": "Delete",
  "account.keys.deleteAria": "Delete key “{name}”",
  "account.keys.deleteTitle": "Delete the key?",
  "account.keys.deleteText":
    "The key “{name}” stops working immediately: an assistant connected with it loses access to your projects. This cannot be undone.",
  "account.keys.deleteFailed": "Could not delete the key.",
  "account.keys.deleted": "Key deleted.",
  "account.keys.cancel": "Cancel",

  "account.created.title": "Key “{name}” created",
  "account.created.warning":
    "Copy the key now: it will not be shown again. If you lose it, delete the key and create a new one.",
  "account.created.keyLabel": "Access key",
  "account.created.commandLabel": "Claude Code connection command, with the key and site address filled in",
  "account.created.done": "Done, I saved the key",

  "account.copy": "Copy",
  "account.copied": "Copied",
  "account.copyFailed": "Could not copy. Select the text and copy it manually.",

  "account.guide.title": "How to connect",
  "account.guide.install.title": "Install the MCP server",
  "account.guide.install.text":
    "You need git, Node.js 22 or newer and Claude Code. The server drives the editor through a Chromium browser, so it is installed along with the dependencies:",
  "account.guide.connect.title": "Connect it to Claude Code",
  "account.guide.connect.text":
    "Create a key above and run the command shown next to it: the key and this site's address are already filled in. The general form of the command:",
  "account.guide.verify.title": "Check the connection",
  "account.guide.verify.text":
    "The list should contain the {server} server with the Connected status. Then ask the assistant to list your projects.",
  "account.guide.revoke.title": "Revoke the key when you no longer need it",
  "account.guide.revoke.text":
    "Delete the key in the list above: access ends immediately, even for an assistant that is already running. To remove the server from Claude Code:",
  "account.guide.more": "Detailed guide and environment variables",
};
