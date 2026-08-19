"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, FileText, FolderOpen, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InlineLoader } from "@/components/ui/Loader";
import { tenantsApi, documentsApi, foldersApi } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { formatBytes, providerLabel } from "@/lib/utils";
import { toast } from "sonner";
export default async function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const [tenant,setTenant]=useState<Tenant|null>(null); const [counts,setCounts]=useState({documents:0,folders:0,trash:0});
 useEffect(()=>{ void (async()=>{try{const [t,d,f]=await Promise.all([tenantsApi.get(id),documentsApi.list({limit:100}),foldersApi.list(null)]);setTenant(t.tenant);const docs=d.documents||[];setCounts({documents:docs.filter(x=>x.status!=="soft_deleted").length,folders:(f.folders||[]).length,trash:docs.filter(x=>x.status==="soft_deleted").length});}catch(e){toast.error(e instanceof Error?e.message:"Unable to load tenant")}})()},[id]);
 if(!tenant)return <AppShell title="Tenant"><InlineLoader label="Loading tenant…"/></AppShell>;
 return <AppShell title={tenant.name} subtitle="Tenant workspace and account summary"><div className="mx-auto max-w-6xl space-y-5 animate-fade-up"><Link href="/tenants" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4"/>All tenants</Link><Card><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Building2/></div><div><div className="flex flex-wrap gap-2"><h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1><StatusBadge status={tenant.status}/></div><p className="mt-1 font-mono text-xs text-slate-500">{tenant.id}</p><p className="mt-2 text-sm text-slate-500">{tenant.slug} · Max file size {formatBytes(tenant.maxFileSizeBytes)}</p></div></div><Link href="/documents" className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Open workspace</Link></div></Card><div className="grid gap-3 sm:grid-cols-3">{[[FileText,"Documents",counts.documents,"/documents"],[FolderOpen,"Folders",counts.folders,"/folders"],[Trash2,"Trash",counts.trash,"/trash"]].map(([Icon,label,value,href])=><Link href={href as string} key={label as string}><Card className="transition hover:-translate-y-0.5 hover:shadow-md"><Icon className="h-5 w-5 text-indigo-600"/><p className="mt-4 text-2xl font-bold text-slate-900">{value as number}</p><p className="text-sm text-slate-500">{label as string}</p></Card></Link>)}</div><Card><CardHeader title="Tenant details" description="Information to share with the customer"/><div className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-xs text-slate-400">Tenant ID</p><p className="mt-1 break-all font-mono text-slate-800">{tenant.id}</p></div><div><p className="text-xs text-slate-400">Storage limit</p><p className="mt-1 text-slate-800">{formatBytes(tenant.maxFileSizeBytes)} per file</p></div><div><p className="text-xs text-slate-400">Allowed file types</p><div className="mt-1 flex flex-wrap gap-1">{(tenant.allowedMimeTypes||[]).map(x=><Badge key={x}>{x}</Badge>)}</div></div><div><p className="text-xs text-slate-400">Status</p><p className="mt-1 text-slate-800">{tenant.status}</p></div></div></Card></div></AppShell>;
}
