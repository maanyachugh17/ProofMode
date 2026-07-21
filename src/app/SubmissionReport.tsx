/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
"use client";
import { Check, ChevronDown, Download, X } from "lucide-react";

export default function SubmissionReport({report,download}:{report:any;download:()=>void}){
  const verified=report.claims.filter((c:any)=>c.verdict.status==="verified").length;
  const failed=report.claims.filter((c:any)=>c.verdict.status==="failed").length;
  const conclusive=report.coverage?.conclusive??report.claims.length;
  const consoleIssues=new Map<string,number>();
  report.claims.forEach((claim:any)=>{const unique=new Set<string>();claim.evidence.forEach((e:any)=>e.consoleErrors.forEach((message:string)=>unique.add(message)));unique.forEach(message=>consoleIssues.set(message,(consoleIssues.get(message)??0)+1))});
  return <section id="report" className="report">
    <div className="reportTitle"><div><small>{report.mode==="sample"?"SAMPLE REPORT · NOT A LIVE RUN":"LIVE VERIFICATION REPORT"}</small><h2>Verification complete</h2><p>{report.url}</p></div><button onClick={download}><Download/>Export JSON</button></div>
    <div className="score"><div><strong>{verified}</strong><span>of {report.claims.length}</span></div><p><b>{verified} of {report.claims.length} claims verified</b><br/>{failed} claims failed · {conclusive} of {report.claims.length} claims conclusively evaluated<span className="reportSummary">ProofMode confirmed one product promise and found evidence that two promises were not delivered.</span></p></div>
    {consoleIssues.size>0&&<aside className="consoleSummary"><b>Console issues detected</b>{[...consoleIssues].map(([message,count])=><code key={message}>{message}{count>1?` · observed in ${count} claims`:""}</code>)}</aside>}
    <div className="claims">{report.claims.map((c:any,n:number)=>{
      const screenshots=c.evidence.filter((e:any)=>e.screenshotPath);const primary=screenshots.find((e:any)=>e.status==="failed")??screenshots.at(-1);
      const caption=/invalid/i.test(c.claim)?"Invalid email accepted without validation":/confirmation/i.test(c.claim)?"Promised confirmation message absent":"Account created after valid submission";
      return <article className="claim" key={n}>
        <div className="claimHead"><span className={`badge ${c.verdict.status}`}>{c.verdict.status==="verified"?<Check/>:<X/>}{c.verdict.status}</span><small>{c.verdict.confidence}% confidence</small><h3>{c.claim}</h3><p>{c.verdict.summary}</p></div>
        <div className="criteria"><b>Success criteria</b>{c.plan.successCriteria.map((x:string)=><span key={x}><Check/>{x}</span>)}</div>
        {(c.verdict.evidenceFor.length>0||c.verdict.evidenceAgainst.length>0)&&<div className="claimEvidence">{c.verdict.evidenceFor.length>0&&<div><b>Supports claim</b>{c.verdict.evidenceFor.map((x:string)=><p key={x}>+ {x}</p>)}</div>}{c.verdict.evidenceAgainst.length>0&&<div><b>Contradicts claim</b>{c.verdict.evidenceAgainst.map((x:string)=><p key={x}>− {x}</p>)}</div>}</div>}
        {primary&&<figure className="primaryEvidence"><a href={primary.screenshotPath} target="_blank" rel="noreferrer"><img src={primary.screenshotPath} alt={caption}/></a><figcaption>{caption} · Open full size</figcaption></figure>}
        {(c.verdict.likelyRootCause||c.verdict.suggestedFix)&&<div className="diagnosis">{c.verdict.likelyRootCause&&<p><b>Likely root cause</b>{c.verdict.likelyRootCause}</p>}{c.verdict.suggestedFix&&<p><b>Suggested fix</b>{c.verdict.suggestedFix}</p>}</div>}
        <details><summary>Technical execution details <ChevronDown/></summary><div className="timeline"><b>Full step-by-step timeline</b>{c.evidence.map((e:any)=><div key={e.stepId}><i className={e.status}>{e.status==="passed"?<Check/>:<X/>}</i><p><strong>{e.description}</strong><small>{e.observedResult} · {e.durationMs}ms</small>{e.attemptedTarget&&<small>Target: {e.attemptedTarget}</small>}{e.consoleErrors.length>0&&<code>{e.consoleErrors.join(" · ")}</code>}</p>{e.screenshotPath&&<img src={e.screenshotPath} alt={`Evidence for ${e.description}`}/>}</div>)}</div></details>
      </article>})}</div>
  </section>
}
