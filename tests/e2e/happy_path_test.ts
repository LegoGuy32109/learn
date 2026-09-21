import { test, expect } from "@playwright/test";
import { chromium } from "@playwright/test";
import { app } from "../../src/app.ts";

Deno.test({name:"phone learner resumes and reaches Learned", sanitizeOps:false,sanitizeResources:false, fn:async () => {
  const server=Deno.serve({port:8001}, app);
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:390,height:844}}); page.setDefaultTimeout(1500);
  try {
    await page.goto("http://127.0.0.1:8001/"); await page.getByRole("button",{name:/How browser HTTP caching works/}).click(); await page.getByRole("button",{name:"Start lesson"}).click();
    await expect(page.getByText("A fresh response can be reused")).toBeVisible(); await page.reload(); await expect(page.getByText("A fresh response can be reused")).toBeVisible();
    let reloadedFeedback=false;
    // Drive every visible surface from its prompt, covering randomized Checks and Wrap-up.
    for(let steps=0;steps<40 && !(await page.getByText("Learned",{exact:true}).count());steps++) {
      if(await page.getByText("Correct",{exact:true}).count()) { await page.getByRole("button",{name:"Continue",exact:true}).click(); await page.waitForTimeout(60); continue; }
      if(await page.getByRole("button",{name:"Continue",exact:true}).count() && !(await page.locator(".qhead").count())) { await page.getByRole("button",{name:"Continue",exact:true}).click(); await page.waitForTimeout(60); continue; }
      if(!(await page.locator(".qhead").count())) throw new Error(await page.locator("body").innerText());
      const text=(await page.locator(".qhead").textContent()) ?? "";
      if(text.includes("fresh response")) await page.getByRole("button",{name:"Reuse it without contacting the origin."}).click();
      else if(text.includes("ETag")) await page.getByRole("button",{name:"If-None-Match"}).click();
      else if(text.includes("no-store")) await page.getByRole("button",{name:"Do not store the response."}).click();
      else if(text.includes("status code")||text.includes("Not Modified")||text.includes("still valid after validation")){await page.locator("#answer").fill("304");await page.getByRole("button",{name:"Answer"}).click();}
      else if(text.includes("Age") || text.includes("time in caches")){await page.locator("#answer").fill("age");await page.getByRole("button",{name:"Answer"}).click();}
      else if(text.includes("directive requires")){await page.locator("#answer").fill("must-revalidate");await page.getByRole("button",{name:"Answer"}).click();}
      else {await page.locator("#answer").fill("60");await page.getByRole("button",{name:"Answer"}).click();}
      await page.waitForTimeout(60);
      if(!reloadedFeedback) {
        await expect(page.getByText("Correct",{exact:true})).toBeVisible();
        await page.evaluate(() => new Promise((resolve, reject) => { const r=indexedDB.open("learn-local-v1"); r.onsuccess=()=>{const t=r.result.transaction("projections","readwrite");t.objectStore("projections").clear();t.oncomplete=()=>resolve(undefined);t.onerror=()=>reject(t.error);}; r.onerror=()=>reject(r.error); }));
        await page.reload(); await expect(page.getByText("Correct",{exact:true})).toBeVisible(); reloadedFeedback=true;
      }
    }
    await expect(page.getByText("Learned").last()).toBeVisible();
  } finally { await browser.close(); await server.shutdown(); }
}});
