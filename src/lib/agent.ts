import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { chromium, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { planSchema, verdictSchema, type ElementTarget, type TestPlan, type StepEvidence } from "./schemas";
import { screenshotDir } from "./storage";

const model = process.env.OPENAI_MODEL || "gpt-5.6";
export type PageSnapshot = { url: string; title: string; headings: string[]; visibleText: string[]; elements: Array<{ tag: string; role: string; accessibleName: string; label: string; placeholder: string; inputType: string; text: string; selectorHint: string; visible: boolean }> };

export async function inspectPage(url: string): Promise<PageSnapshot> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
    return await page.evaluate(() => {
      const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().slice(0, 180);
      const candidates = Array.from(document.querySelectorAll("input,button,a,textarea,select,[role],h1,h2,h3,[aria-live]"));
      const elements = candidates.slice(0, 80).map((el) => {
        const html = el as HTMLElement; const input = el as HTMLInputElement;
        const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent : "";
        const role = el.getAttribute("role") || ({ BUTTON: "button", A: "link", INPUT: input.type === "submit" ? "button" : "textbox" } as Record<string,string>)[el.tagName] || "";
        const accessibleName = clean(el.getAttribute("aria-label") || label || (el.tagName === "BUTTON" ? el.textContent : ""));
        return { tag: el.tagName.toLowerCase(), role, accessibleName, label: clean(label), placeholder: clean(input.placeholder), inputType: input.type || "", text: clean(el.textContent), selectorHint: input.id ? `#${input.id}` : "", visible: !!(html.offsetWidth || html.offsetHeight || html.getClientRects().length) };
      });
      return { url: location.href, title: document.title, headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((e) => clean(e.textContent)), visibleText: Array.from(document.querySelectorAll("p,small,[aria-live]")).filter((e) => (e as HTMLElement).offsetParent !== null).slice(0,30).map((e) => clean(e.textContent)), elements };
    });
  } finally { await browser.close(); }
}

export async function planClaim(url: string, claim: string, instructions: string, snapshot: PageSnapshot) {
  const ai = new OpenAI();
  const r = await ai.responses.parse({ model, input: [
    { role: "system", content: "Create a small deterministic browser test using only controls present in PAGE SNAPSHOT. Never invent fields, buttons, messages, or selectors. Targets are structured and separate from descriptions. Prefer role, then label, placeholder, text, and CSS only as fallback. Use null for inapplicable fields. Mark only outcome-determining assertions critical." },
    { role: "user", content: JSON.stringify({ url, claim, instructions, pageSnapshot: snapshot }) },
  ], text: { format: zodTextFormat(planSchema, "test_plan") } });
  if (!r.output_parsed) throw new Error("Model returned no valid test plan");
  return r.output_parsed;
}

const T = (strategy: ElementTarget["strategy"], value: string, role: string | null = null, name: string | null = null): ElementTarget => ({ strategy, value, role, name });
export function demoPlan(claim: string, url: string): TestPlan {
  const base = { claim, assumptions: ["The built-in demo form is available"], interpretation: claim, successCriteria: [] as string[], steps: [] as TestPlan["steps"] };
  const go = { id: "open", action: "goto" as const, target: null, value: url, description: "Open the demo signup", expectedResult: "Signup form is visible", critical: true };
  const shot = { id: "evidence", action: "screenshot" as const, target: null, value: null, description: "Capture final evidence", expectedResult: "Screenshot saved", critical: false };
  if (/invalid/i.test(claim)) return { ...base, successCriteria: ["An invalid email is rejected with a visible validation error"], steps: [go, { id:"fill-invalid", action:"fill", target:T("label","Email address"), value:"not-an-email", description:"Enter an invalid email", expectedResult:"Invalid value entered", critical:true }, { id:"submit-invalid", action:"click", target:T("role","Create account","button","Create account"), value:null, description:"Submit the invalid email", expectedResult:"Submission is blocked", critical:true }, { id:"assert-error", action:"assert_text", target:T("text","Invalid email"), value:null, description:"Check for validation feedback", expectedResult:"Invalid email is visible", critical:true }, shot] };
  if (/confirmation/i.test(claim)) return { ...base, successCriteria: ["A successful submission occurs", "The promised Check your inbox confirmation is visible"], steps: [go, { id:"fill-valid", action:"fill", target:T("label","Email address"), value:"demo@example.com", description:"Enter a valid email", expectedResult:"Valid value entered", critical:true }, { id:"submit-valid", action:"click", target:T("role","Create account","button","Create account"), value:null, description:"Submit the valid email", expectedResult:"Account creation occurs", critical:true }, { id:"assert-created", action:"assert_text", target:T("text","Account created"), value:null, description:"Confirm submission occurred", expectedResult:"Account created is visible", critical:true }, { id:"assert-confirmation", action:"assert_text", target:T("text","Check your inbox"), value:null, description:"Check for promised confirmation", expectedResult:"Check your inbox is visible", critical:true }, shot] };
  return { ...base, successCriteria: ["A valid email can be submitted", "Account created is visibly confirmed"], steps: [go, { id:"fill-valid", action:"fill", target:T("label","Email address"), value:"demo@example.com", description:"Enter a valid email", expectedResult:"Valid value entered", critical:true }, { id:"submit-valid", action:"click", target:T("role","Create account","button","Create account"), value:null, description:"Create the account", expectedResult:"Submission completes", critical:true }, { id:"assert-created", action:"assert_text", target:T("text","Account created"), value:null, description:"Verify account creation", expectedResult:"Account created is visible", critical:true }, shot] };
}

function describeTarget(t: ElementTarget | null) { return t ? `${t.strategy}:${t.role || ""}:${t.name || t.value || ""}` : "none"; }
function resolveTarget(page: Page, t: ElementTarget) {
  switch (t.strategy) {
    case "role": return page.getByRole(t.role as Parameters<Page["getByRole"]>[0], { name: t.name || t.value || "", exact: true });
    case "label": return page.getByLabel(t.value || t.name || "", { exact: true });
    case "placeholder": return page.getByPlaceholder(t.value || "", { exact: true });
    case "text": return page.getByText(t.value || t.name || "", { exact: false });
    case "css": return page.locator(t.value || "__missing__");
  }
}
async function focusInfo(page: Page) { return page.evaluate(() => { const e = document.activeElement as HTMLElement | null; if (!e) return { tag:"",role:"",accessibleName:"",label:"",text:"",visibleFocusIndicator:false }; const label = (e as HTMLInputElement).id ? document.querySelector(`label[for="${CSS.escape((e as HTMLInputElement).id)}"]`)?.textContent || "" : ""; const s=getComputedStyle(e); return { tag:e.tagName.toLowerCase(), role:e.getAttribute("role")||({BUTTON:"button",INPUT:"textbox",A:"link"} as Record<string,string>)[e.tagName]||"", accessibleName:e.getAttribute("aria-label")||label||e.textContent?.trim()||"", label:label.trim(), text:e.textContent?.trim()||"", visibleFocusIndicator:s.outlineStyle!=="none"&&s.outlineWidth!=="0px" }; }); }

export async function executePlan(run: string, plan: TestPlan, baseUrl: string) {
  const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(2200);
  const errors: string[] = []; page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); const out: StepEvidence[] = []; const dir = screenshotDir(run); await mkdir(dir, { recursive: true });
  try { for (const step of plan.steps) { const start=Date.now(); let status:"passed"|"failed"="passed", observed="Action completed", error:string|undefined, screenshotPath:string|undefined, focus; const attemptedTarget=describeTarget(step.target);
    try { const locator = step.target ? resolveTarget(page, step.target) : null; if (locator && await locator.count() === 0) throw new Error(`Target not found (${attemptedTarget})`);
      switch(step.action) { case"goto": await page.goto(step.value||baseUrl,{waitUntil:"domcontentloaded",timeout:8000}); observed="Page loaded"; break; case"click": await locator!.click(); observed=`Clicked ${attemptedTarget}`; break; case"fill": await locator!.fill(step.value||""); observed=`Filled ${attemptedTarget}`; break; case"press": if(locator) await locator.press(step.value||"Enter"); else await page.keyboard.press(step.value||"Tab"); focus=await focusInfo(page); observed=`Focused ${focus.tag} ${focus.accessibleName}`; break; case"wait": await page.waitForTimeout(Math.min(Number(step.value)||400,1500)); observed="Wait completed"; break; case"assert_text": await locator!.waitFor({state:"visible",timeout:2500}); observed=`Observed ${step.target?.value||step.target?.name}`; break; case"assert_url": if(!page.url().includes(step.value||"")) throw new Error(`URL did not include ${step.value}`); observed="URL matched"; break; case"assert_visible": await locator!.waitFor({state:"visible",timeout:2500}); observed=`Visible ${attemptedTarget}`; break; case"assert_focused": focus=await focusInfo(page); if(!focus.accessibleName.includes(step.target?.name||step.target?.value||"")) throw new Error(`Expected focus on ${attemptedTarget}, found ${focus.tag}:${focus.accessibleName}`); observed=`Focus confirmed on ${focus.accessibleName}`; break; case"screenshot": break; }
      if(["click","press","screenshot"].includes(step.action)){const file=`${step.id.replace(/[^a-z0-9_-]/gi,"_")}.png`;await page.screenshot({path:path.join(dir,file),fullPage:true});screenshotPath=`/api/artifacts/${run}/${file}`;}
    } catch(e){status="failed";error=e instanceof Error?e.message:String(e);observed="Expected result was not observed";const file=`${step.id.replace(/[^a-z0-9_-]/gi,"_")}-failed.png`;await page.screenshot({path:path.join(dir,file),fullPage:true}).catch(()=>{});screenshotPath=`/api/artifacts/${run}/${file}`;}
    out.push({stepId:step.id,status,description:step.description,observedResult:observed,currentUrl:page.url(),screenshotPath,consoleErrors:[...errors],durationMs:Date.now()-start,error,attemptedTarget,focus,critical:step.critical});
  }} finally { await browser.close(); } return out;
}

export async function evaluate(claim:string, plan:TestPlan, evidence:StepEvidence[]){const ai=new OpenAI();const r=await ai.responses.parse({model,input:[{role:"system",content:"Evaluate required criteria from direct evidence. Verified: every required criterion supported. Failed: any required criterion directly contradicted (including accepted invalid input or a missing expected message after confirmed submission). Partial: some criteria pass and some fail. Inconclusive only when execution never reached the outcome. Ignore noncritical failures. Confidence is an integer 0-100. Use null when fix fields do not apply."},{role:"user",content:JSON.stringify({claim,successCriteria:plan.successCriteria,plan,evidence})}],text:{format:zodTextFormat(verdictSchema,"claim_verdict")}});if(!r.output_parsed)throw new Error("Model returned no valid verdict");return r.output_parsed;}

export function evaluateDemoClaim(claim: string, evidence: StepEvidence[]) {const passed=(id:string)=>evidence.find(e=>e.stepId===id)?.status==="passed";const submitted=passed("submit-valid")||passed("submit-invalid");if(!submitted)return {status:"inconclusive" as const,confidence:45,summary:"The test could not reach submission, so the claim could not be judged.",evidenceFor:[],evidenceAgainst:[],reproductionSteps:["Open the demo target","Attempt the signup flow"],likelyRootCause:"The submission control could not be exercised.",suggestedFix:"Restore an accessible submission control."};if(/invalid/i.test(claim))return {status:"failed" as const,confidence:99,summary:"The invalid address was submitted and no validation error appeared.",evidenceFor:[],evidenceAgainst:["not-an-email was accepted","No visible Invalid email feedback appeared"],reproductionSteps:["Open the demo target","Enter not-an-email","Select Create account","Observe Account created and no validation error"],likelyRootCause:"The submit handler does not validate the email value.",suggestedFix:"Validate email syntax before setting the success state and render an accessible error."};if(/confirmation/i.test(claim))return {status:"failed" as const,confidence:99,summary:"Submission succeeded, but the specifically promised Check your inbox confirmation was absent.",evidenceFor:["Account created proved that submission completed"],evidenceAgainst:["Check your inbox did not appear after submission"],reproductionSteps:["Open the demo target","Enter demo@example.com","Select Create account","Observe Account created without Check your inbox"],likelyRootCause:"The success state renders a generic message instead of the promised confirmation.",suggestedFix:"Render the promised Check your inbox message in the live status region."};return {status:passed("assert-created")?"verified" as const:"failed" as const,confidence:99,summary:passed("assert-created")?"A valid email was submitted and the page visibly confirmed Account created.":"The page did not confirm account creation after a valid submission.",evidenceFor:passed("assert-created")?["Account created appeared after valid submission"]:[],evidenceAgainst:passed("assert-created")?[]:["Account created did not appear"],reproductionSteps:["Open the demo target","Enter demo@example.com","Select Create account","Observe the result"],likelyRootCause:passed("assert-created")?null:"The success state was not rendered.",suggestedFix:passed("assert-created")?null:"Render Account created after successful submission."};}
