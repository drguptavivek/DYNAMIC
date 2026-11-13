import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { DashboardImageError, readDashboardAttachmentImage } from "../lib/dashboardAttachmentImage";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireDataAccess } from "../lib/dataAccess";
import { dashboardScope } from "../lib/operationsDashboard";
import { getSupervisorLocalities } from "../lib/supervisorVillageAssignments";
import { getLatestFormMetadata } from "../lib/formCatalog";
import { getEffectiveFormJson } from "../lib/formLanguage";
import { buildCompletedFormPreview, householdCompletedFormsSql, savedFormAnswers } from "../lib/dashboardHouseholdForms";
import { sendError, sendSuccess } from "../lib/errors";
const router=Router();
router.get("/",requireAuth,requireDataAccess("can_access_aggregate_dashboards"),requireDataAccess("can_access_pii"),async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  try {
    const now=new Date();
    const scope=dashboardScope(req.user!,req.query,now,req.user!.role === "field_supervisor" ? await getSupervisorLocalities(req.user!,now):undefined);
    const result=await db.execute(householdCompletedFormsSql(scope,req.query.household_id));
    const definitions=new Map<string,Record<string,unknown>|null>();
    const forms=[];
    for(const row of result.rows as any[]) {
      const key=`${row.site_id}:${row.form_code}`;
      if(!definitions.has(key)) definitions.set(key,await getEffectiveFormJson(row.form_code,row.site_id));
      const definition=definitions.get(key);
      const attachments=await db.select({attachment_id:schema.formAttachments.attachment_id,
        question_name:schema.formAttachments.question_name,display_name:schema.formAttachments.display_name,
        report_sequence:schema.formAttachments.report_sequence,image_sequence:schema.formAttachments.image_sequence,
        ultrasound_date:schema.formAttachments.ultrasound_date,mime_type:schema.formAttachments.mime_type})
        .from(schema.formAttachments).where(and(eq(schema.formAttachments.form_response_id,row.form_response_id),
          eq(schema.formAttachments.household_id,String(req.query.household_id)),eq(schema.formAttachments.form_code,row.form_code),
          eq(schema.formAttachments.uploaded_by_user_id,row.submitted_by_user_id)));
      forms.push({attachments:attachments.sort((a,b)=>a.report_sequence-b.report_sequence||a.image_sequence-b.image_sequence),form_response_id:row.form_response_id,form_code:row.form_code,form_version:row.form_version,
        subject_id:row.subject_id,submitted_at:row.submitted_at,submitted_by_user_id:row.submitted_by_user_id,
        definition_version:getLatestFormMetadata(row.form_code)?.version ?? null,definition_note:"Read-only review uses the currently published questionnaire and saved submitted answers.",
        ...(definition ? buildCompletedFormPreview(definition,{...savedFormAnswers(row.prefill_snapshot_json),...savedFormAnswers(row.answers_json)}) : {language_code:"en",title:row.form_code,preview:[],definition_note:"Questionnaire definition unavailable; the saved form cannot be rendered."})});
    }
    sendSuccess(res,{household_id:req.query.household_id,forms});
  } catch(error) {
    if(error instanceof Error && error.message === "DASHBOARD_FORBIDDEN") sendError(res,403,"FORBIDDEN","You cannot view these saved forms");
    else if(error instanceof Error && error.message.startsWith("INVALID_")) sendError(res,400,error.message,"Select a valid user, household, site, village and date period");
    else {console.error("Dashboard household forms error:",error);sendError(res,500,"INTERNAL_ERROR","Could not load saved forms");}
  }
});
router.get("/attachments/:id",requireAuth,requireDataAccess("can_access_aggregate_dashboards"),requireDataAccess("can_access_pii"),async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  try {
    const id=req.params.id;
    if(!id || id.length>200 || /[\x00-\x1f/\\]/.test(id)) {sendError(res,404,"IMAGE_NOT_FOUND","Image not found");return;}
    const now=new Date();
    const scope=dashboardScope(req.user!,req.query,now,req.user!.role === "field_supervisor" ? await getSupervisorLocalities(req.user!,now):undefined);
    const result=await db.execute(householdCompletedFormsSql(scope,req.query.household_id));
    const rows=result.rows as any[];
    if(!rows.length) {sendError(res,404,"IMAGE_NOT_FOUND","Image not found for the selected household and filters");return;}
    const [attachment]=await db.select().from(schema.formAttachments).where(and(eq(schema.formAttachments.attachment_id,id),
      eq(schema.formAttachments.household_id,String(req.query.household_id)),inArray(schema.formAttachments.form_response_id,rows.map(row=>row.form_response_id)))).limit(1);
    const form=rows.find(row=>row.form_response_id===attachment?.form_response_id);
    if(!attachment || !form || attachment.attachment_id!==id || attachment.household_id!==String(req.query.household_id) || attachment.form_code!==form.form_code || attachment.uploaded_by_user_id!==form.submitted_by_user_id) {
      sendError(res,404,"IMAGE_NOT_FOUND","Image not found for the selected household and filters");return;
    }
    const image=await readDashboardAttachmentImage(attachment.relative_path,attachment.mime_type);
    res.setHeader("Content-Type",image.mime);
    res.setHeader("Content-Length",image.bytes.length);
    res.send(image.bytes);
  }catch(error) {
    if(error instanceof DashboardImageError) sendError(res,error.status,error.code,error.status===404?"Uploaded image file is unavailable":"This uploaded file cannot be displayed as an image");
    else if(error instanceof Error && error.message==="DASHBOARD_FORBIDDEN") sendError(res,403,"FORBIDDEN","You cannot view these images");
    else if(error instanceof Error && error.message.startsWith("INVALID_")) sendError(res,400,error.message,"Select valid household, user and date filters");
    else {console.error("Dashboard attachment image error:",error);sendError(res,500,"INTERNAL_ERROR","Could not load image");}
  }
});
export default router;
