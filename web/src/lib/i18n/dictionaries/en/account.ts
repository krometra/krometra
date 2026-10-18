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
  "account.guide.connect.title":
    "Connect the server to Claude Code",
  "account.guide.connect.text":
    "The server runs on this site — there is nothing to install. Create a key above and run the command shown next to it: the key and the site address are already filled in. The general form of the command:",
  "account.guide.verify.title": "Check the connection",
  "account.guide.verify.text":
    "The list should contain the {server} server with the Connected status. Then ask the assistant to list your projects.",
  "account.guide.revoke.title": "Revoke the key when you no longer need it",
  "account.guide.revoke.text":
    "Delete the key in the list above: access ends immediately, even for an assistant that is already running. To remove the server from Claude Code:",
  "account.guide.open.title":
    "Keep the project open in your browser",
  "account.guide.open.text":
    "The assistant works in the open editor tab: you watch the model change while the “AI agent is controlling the editor” badge is on. If the tab is closed, the assistant sends you a link to the project — open it.",
  "account.guide.local.title":
    "Local server — if keeping a tab open is inconvenient",
  "account.guide.local.text":
    "The server is installed on your computer and opens the editor in a background Chromium browser. You need git, Node.js 22 or newer and Claude Code. Installation:",
  "account.guide.local.connect":
    "Connection (instead of the command from step 1):",
  "account.guide.more": "Detailed guide and environment variables",
  "account.guide.agent": "Copy instructions for an agent",
  "account.agent.prompt":
    "Connect the {product} MCP server (browser-based 3D CAD) to Claude Code and check that it works. The server runs on the site, there is nothing to install.\n\n1. Connect the server for all of the user's projects:\n\n```bash\n{connect}\n```\n\n{keyNote}\n\n2. Check the connection: the output must list the krometra server with the Connected status.\n\n```bash\n{verify}\n```\n\n3. Restart Claude Code or run /mcp, then call the cad_list_projects tool.\n\nHow to work with the editor: cad_open_project — commands run in the editor tab the user has open, so if the tool asks for it, give the user the project link. Then cad_capabilities (the only source of truth about operations), cad_state and cad_snapshot to read the model, cad_request to run operations. Sizes are in millimetres. Details: {readme}",
  "account.agent.keyPlaceholder": "Replace krm_... with an access key from the Account page ({origin}/account): ask the user for it.",
  "account.agent.keyFilled": "The access key and site address are already filled in.",

  "account.email.title": "Email",
  "account.email.verified": "{email} is confirmed.",
  "account.email.unverified": "{email} is not confirmed: we sent an email with a link when you signed up.",
  "account.email.resend": "Send the email again",
  "account.email.resendIn": "Send again in {seconds} s",
  "account.email.sent": "Email sent. Check your inbox and the spam folder.",
  "account.email.resendFailed": "Could not send the email.",
  "account.email.banner": "Confirm your email {email}.",
  "account.email.bannerQuestion": "Didn't get the email?",

  "account.password.title": "Password",
  "account.password.intro": "After a password change, sessions on other devices end and this one stays.",
  "account.password.current": "Current password",
  "account.password.submit": "Change password",
  "account.password.failed": "Could not change the password.",
  "account.password.changed": "Password changed. Other sessions have been ended.",
  "account.password.forgot": "Don't remember the current password?",
  "account.password.forgotLink": "Recover by email",

  "account.keys.needsVerifiedEmail":
    "Access keys can be created once your email is confirmed: open the link from the email or send it again in the Email section.",
};
