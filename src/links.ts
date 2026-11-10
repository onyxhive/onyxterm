import { openUrl } from "@tauri-apps/plugin-opener";
import { prApi } from "./gitApi";

export interface PullRequestLink {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

export type PullRequestOpener = (projectIds: string[], number: number) => void;

const PULL_REQUEST_SOURCE = String.raw`https://github\.com/([\w.-]+)/([\w.-]+)/pull/(\d+)`;
const PULL_REQUEST_URL = new RegExp(`^${PULL_REQUEST_SOURCE}(?:[/?#]|$)`, "i");
const PULL_REQUEST_MENTION = new RegExp(`${PULL_REQUEST_SOURCE}(?!\\w)`, "gi");
const WEB_URL = /^https?:\/\//i;
const IN_PAGE_HREF_PREFIX = "#";

let openPullRequestInOnyx: PullRequestOpener | null = null;

function pullRequestLinkFrom([, owner, repo, number]: RegExpMatchArray): PullRequestLink {
  return { owner, repo, number: Number(number), url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

export function pullRequestLinkOf(url: string): PullRequestLink | null {
  const match = url.trim().match(PULL_REQUEST_URL);
  return match ? pullRequestLinkFrom(match) : null;
}

export function pullRequestLinksIn(texts: string[]): PullRequestLink[] {
  const links = texts.flatMap((text) => [...text.matchAll(PULL_REQUEST_MENTION)].map(pullRequestLinkFrom));
  return [...new Map(links.map((link) => [link.url, link])).values()];
}

export function setPullRequestOpener(opener: PullRequestOpener | null) {
  openPullRequestInOnyx = opener;
}

async function projectsOfRepository(link: PullRequestLink): Promise<string[]> {
  return prApi.projectsForRepository(link.owner, link.repo).catch(() => []);
}

export async function openLink(url: string) {
  if (!WEB_URL.test(url)) return;
  const link = pullRequestLinkOf(url);
  const projectIds = link ? await projectsOfRepository(link) : [];
  if (link && openPullRequestInOnyx && projectIds.length > 0) {
    openPullRequestInOnyx(projectIds, link.number);
    return;
  }
  await openUrl(url);
}

function routeLinkClick(event: MouseEvent) {
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  const href = anchor?.getAttribute("href");
  if (!href || href.startsWith(IN_PAGE_HREF_PREFIX)) return;
  event.preventDefault();
  void openLink(href);
}

export function keepLinksInsideOnyx() {
  window.addEventListener("click", routeLinkClick, { capture: true });
}
