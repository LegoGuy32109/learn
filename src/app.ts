import { page } from "./server/views/page.ts";
const root = new URL("../", import.meta.url);
const lesson = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
const mime: Record<string,string>={".css":"text/css",".js":"text/javascript"};
export function app(request: Request) { const url=new URL(request.url); if (url.pathname === "/" || url.pathname.startsWith("/learn/")) return new Response(page(lesson),{headers:{"content-type":"text/html"}}); if (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/")) { const file=new URL("../public"+url.pathname,import.meta.url); return Deno.readFile(file).then(b=>new Response(b,{headers:{"content-type":mime[url.pathname.slice(url.pathname.lastIndexOf("."))]||"application/octet-stream"}})).catch(()=>new Response("Not found",{status:404})); } return new Response("Not found",{status:404}); }
