// Answer key for the demo lesson, keyed by a distinctive fragment of each stem, plus page helpers
// shared by the phone-viewport tests.
import { expect } from "@playwright/test";

export interface Answer {
  fragment: string;
  option?: string;
  text?: string;
}

export const ANSWERS: Answer[] = [
  { fragment: "current age of 20 seconds", option: "Reuse the stored response without contacting the origin at all." },
  { fragment: "max-age=300 and Age: 120", text: "180" },
  { fragment: "already spent in caches", text: "Age" },
  { fragment: "current age of 90 seconds", option: "Send a conditional request and reuse the stored body only on a 304." },
  { fragment: "still has ETag \"v7\"", option: "The origin answers 304 Not Modified and the cache keeps serving its stored body." },
  { fragment: "carries a stored ETag", text: "If-None-Match" },
  { fragment: "kilobytes of body", text: "200" },
  { fragment: "now has ETag \"v8\"", option: "The origin answers 200 with a complete body and the cache replaces its stored copy." },
  { fragment: "Cache-Control: no-store", option: "Do not keep any copy of the response in the cache, not even briefly." },
  { fragment: "must-revalidate require", option: "Keep a copy, but once stale never serve it without a successful check." },
  { fragment: "max-age=600 and Age: 60", text: "540" },
  { fragment: "requires a stale response to pass", text: "must-revalidate" },
];

export function answerFor(stem: string): Answer {
  const answer = ANSWERS.find((candidate) => stem.includes(candidate.fragment));
  if (!answer) throw new Error(`No answer key for stem: ${stem}`);
  return answer;
}

export async function openFirstCard(page: any, origin: string) {
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: /How browser HTTP caching works/ }).click();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(page.locator(".cardbody h2")).toHaveText("A fresh response can be reused");
}

export async function readCards(page: any, count: number) {
  for (let index = 0; index < count; index++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForTimeout(40);
  }
}

export async function stem(page: any): Promise<string> {
  return (await page.locator(".qhead").textContent()) ?? "";
}

export async function answerCorrectly(page: any): Promise<string> {
  const text = await stem(page);
  const answer = answerFor(text);
  if (answer.option) await page.getByRole("button", { name: answer.option, exact: true }).click();
  else {
    await page.locator("#answer").fill(answer.text);
    await page.getByRole("button", { name: "Answer" }).click();
  }
  await page.waitForTimeout(40);
  return text;
}

export async function answerWrong(page: any): Promise<string> {
  const text = await stem(page);
  const answer = answerFor(text);
  if (answer.option) await page.locator(".opt").filter({ hasNotText: answer.option }).first().click();
  else {
    await page.locator("#answer").fill("wrong");
    await page.getByRole("button", { name: "Answer" }).click();
  }
  await page.waitForTimeout(40);
  return text;
}

export async function clearProjections(page: any) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("learn-local-v1");
    request.onsuccess = () => {
      const transaction = request.result.transaction("projections", "readwrite");
      transaction.objectStore("projections").clear();
      transaction.oncomplete = () => resolve(undefined);
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }));
}
