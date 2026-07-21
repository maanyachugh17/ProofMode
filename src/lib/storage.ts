import { mkdir,readFile,writeFile } from "node:fs/promises"; import path from "node:path";
const root=path.join(process.cwd(),"artifacts","runs");
export async function save(run:string,name:string,data:unknown){const dir=path.join(root,run);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,name),JSON.stringify(data,null,2));}
export async function load(run:string){return JSON.parse(await readFile(path.join(root,run,"report.json"),"utf8"));}
export function screenshotDir(run:string){return path.join(root,run,"screenshots")}
