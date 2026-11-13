import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { mkdtemp,mkdir,writeFile,rm,symlink } from "node:fs/promises";
import { DashboardImageError,readDashboardAttachmentImage } from "./dashboardAttachmentImage";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=","base64");
test("dashboard image reads only supported bytes within the configured real storage root",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"dynamic-dashboard-image-"));
  try{
    await mkdir(path.join(root,"uploads"));await writeFile(path.join(root,"uploads","safe.png"),png);
    const image=await readDashboardAttachmentImage("imageuploads/safe.png","image/png",path.join(root,"uploads"));
    assert.deepEqual(image.bytes,png);assert.equal(image.mime,"image/png");
    for(const relative of ["../safe.png","imageuploads/../safe.png","imageuploads/../../secret","imageuploads/dir\\safe.png","imageuploads//safe.png"]) {
      await assert.rejects(()=>readDashboardAttachmentImage(relative,"image/png",path.join(root,"uploads")),(error:any)=>error instanceof DashboardImageError&&error.status===404);
    }
    await assert.rejects(()=>readDashboardAttachmentImage("imageuploads/missing.png","image/png",path.join(root,"uploads")),(error:any)=>error.status===404);
    await assert.rejects(()=>readDashboardAttachmentImage("imageuploads/safe.png","image/svg+xml",path.join(root,"uploads")),(error:any)=>error.status===415);
    await writeFile(path.join(root,"uploads","fake.png"),"<svg>not a raster image</svg>");
    await assert.rejects(()=>readDashboardAttachmentImage("imageuploads/fake.png","image/png",path.join(root,"uploads")),(error:any)=>error.status===415);
    await writeFile(path.join(root,"outside.png"),png);
    await symlink(root,path.join(root,"uploads","escape"),process.platform==="win32"?"junction":"dir");
    await assert.rejects(()=>readDashboardAttachmentImage("imageuploads/escape/outside.png","image/png",path.join(root,"uploads")),(error:any)=>error.status===404);
  }finally{await rm(root,{recursive:true,force:true});}
});
