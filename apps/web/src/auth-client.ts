import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  fetchOptions: {
    credentials: "include"
  },
  plugins: [
    inferAdditionalFields({
      user: {
        role: {
          type: "string",
          required: false,
          input: false
        }
      }
    })
  ]
});

export const { useSession } = authClient;
