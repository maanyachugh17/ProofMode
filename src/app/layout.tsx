import type { Metadata } from "next";import "./globals.css";
export const metadata:Metadata={title:"ProofMode — Evidence over promises",description:"Autonomous, evidence-backed product verification."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
