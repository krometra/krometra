import { test as setup, request, type APIRequestContext } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL || "e2e-agent@example.com";
const password = process.env.E2E_USER_PASSWORD || "testpass123";
const authFile = "e2e/.auth/user.json";
const DELETE_BATCH = 10;

async function deleteAllProjects(api: APIRequestContext, accessToken: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const listResponse = await api.get("/api/projects/", { headers });
  if (!listResponse.ok()) {
    throw new Error(`E2E project list failed: ${listResponse.status()} ${await listResponse.text()}`);
  }
  const { projects } = (await listResponse.json()) as { projects: { id: string }[] };
  for (let start = 0; start < projects.length; start += DELETE_BATCH) {
    const batch = projects.slice(start, start + DELETE_BATCH);
    const responses = await Promise.all(batch.map(({ id }) => api.delete(`/api/projects/${id}`, { headers })));
    const failed = responses.find((response) => !response.ok() && response.status() !== 404);
    if (failed) throw new Error(`E2E project cleanup failed: ${failed.status()} ${await failed.text()}`);
  }
}

setup("authenticate", async () => {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
  const api = await request.newContext({ baseURL });

  let loginResponse = await api.post("/api/auth/token", {
    form: { grant_type: "password", username: email, password },
  });
  if (loginResponse.status() === 400 || loginResponse.status() === 401) {
    const registerResponse = await api.post("/api/auth/register", {
      data: { email, password, display_name: "E2E", personal_data_consent: true },
    });
    if (registerResponse.status() !== 201 && registerResponse.status() !== 409) {
      throw new Error(
        `E2E user registration failed: ${registerResponse.status()} ${await registerResponse.text()}`,
      );
    }
    loginResponse = await api.post("/api/auth/token", {
      form: { grant_type: "password", username: email, password },
    });
  }
  if (!loginResponse.ok()) {
    throw new Error(`E2E login failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }

  const { access_token: accessToken } = (await loginResponse.json()) as { access_token: string };
  await deleteAllProjects(api, accessToken);

  await api.storageState({ path: authFile });
  await api.dispose();
});
