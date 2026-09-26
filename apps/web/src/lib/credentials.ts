import {
  SessionPatCredentialProvider,
  SharedPatCredentialProvider,
  type CredentialProvider,
} from "@repo-apps/credentials";
import { createAuthorizedGitHubClient } from "@repo-apps/authorized-github";

const APP_ID = "project-dashboard";
const requestToken = async (): Promise<string> => {
  throw new Error("Enter a PAT in the connection form.");
};

const sessionProvider = new SessionPatCredentialProvider({ appId: APP_ID, requestToken });
const sharedProvider = new SharedPatCredentialProvider({
  appId: APP_ID,
  requestToken,
  repositoryHint: "repositories authorized by your GitHub PAT",
});
let activeProvider: CredentialProvider | null = null;

export function hasSharedCredential(): Promise<boolean> {
  return sharedProvider.hasShared().catch(() => false);
}

async function verify(provider: CredentialProvider): Promise<string> {
  const github = createAuthorizedGitHubClient({ credentials: provider });
  const [{ data: user }, { data: repositories }] = await Promise.all([
    github.request<{ login: string }>("GET /user"),
    github.request<readonly unknown[]>("GET /user/repos", {
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
      per_page: 1,
    }),
  ]);
  if (!user.login || !Array.isArray(repositories)) throw new Error("GitHub access could not be verified.");
  return user.login;
}

export async function restoreCredential(): Promise<{ provider: CredentialProvider | null; account?: string }> {
  try {
    if (await sharedProvider.hasAppRegistration()) {
      await sharedProvider.useShared();
      const account = await verify(sharedProvider);
      activeProvider = sharedProvider;
      return { provider: activeProvider, account };
    }
  } catch {
    await sharedProvider.disconnect();
  }

  try {
    if (await sessionProvider.get()) {
      const account = await verify(sessionProvider);
      activeProvider = sessionProvider;
      return { provider: activeProvider, account };
    }
  } catch {
    // A stale session token is cleared below.
  }
  await sessionProvider.disconnect();

  activeProvider = null;
  return { provider: null };
}

export async function connectSharedCredential(): Promise<{ provider: CredentialProvider; account: string }> {
  await sharedProvider.useShared();
  const account = await verify(sharedProvider);
  activeProvider = sharedProvider;
  return { provider: sharedProvider, account };
}

export async function connectSessionCredential(token: string): Promise<{ provider: CredentialProvider; account: string }> {
  let pendingToken = token;
  const provider = new SessionPatCredentialProvider({
    appId: APP_ID,
    requestToken: async () => {
      const submitted = pendingToken;
      pendingToken = "";
      return submitted;
    },
  });
  await provider.connect();
  try {
    const account = await verify(provider);
    activeProvider = provider;
    return { provider, account };
  } catch (error) {
    await provider.disconnect();
    throw error;
  }
}

export async function disconnectCredential(): Promise<void> {
  await activeProvider?.disconnect();
  activeProvider = null;
}
